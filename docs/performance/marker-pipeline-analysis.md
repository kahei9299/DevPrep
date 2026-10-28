# Marker Pipeline Analysis

**Date:** 2026-10-28
**Branch:** `perf/marker-compilation-cache`

---

## Context

Python and C++ submissions are validated by a separate Java Marker container. PR #5 instrumentation identified this as the dominant latency contributor — the `judge` stage accounts for 75-95% of total Run time for non-Java languages.

This document breaks the Marker pipeline into individually timed stages to identify cacheable work.

## Environment

| Property | Value |
|---|---|
| Host | macOS ARM64, Apple M4, 24 GB |
| Docker Desktop | 29.4.3 |
| Node.js | v26.0.0 |
| Java image | `alpine/java:22-jdk` |
| Container limits | 512 MB memory, 1 CPU, 256 PIDs, NetworkMode: none |

## Marker Pipeline (Python/C++ submissions)

When a Python or C++ submission finishes execution, the server calls `getMarkerResponses()` in `src/lib/markerRunner.ts`. This function:

1. Reads `Marker.java` from the problem directory.
2. Generates a `Main.java` harness embedding the test inputs and user outputs.
3. Acquires a Java container from the pool (or creates one).
4. Uploads 5 `.java` files via tar archive.
5. Compiles all files with `javac *.java`.
6. Runs `java Main` with a 15-second timeout.
7. Parses stdout into per-test verdicts.
8. Releases the container back to the pool.

For Java submissions, the Marker is compiled alongside user code in the same container (merged path). No separate Marker container is used.

## Instrumented Stage Timings

Measured with `COJUDGE_PERF=1` across multiple runs of `two-sum/python` and `group-anagrams/cpp`. Clean container pool (warm containers available after first run).

### Per-stage breakdown (two-sum, 9 observations)

| Stage | Time (ms) | % of total | What it does |
|---|---|---|---|
| resolveMarker | 0–2 | 0% | Read `Marker.java` from filesystem |
| acquireContainer | 32–82 | 2% | `ContainerPool.acquire()` — inspect + cleanContainer |
| uploadSources | 2–4 | 0% | tar pack 5 files → `container.putArchive()` |
| **compile** | **2,748–3,288** | **85%** | `javac *.java` — compiles all 5 Java source files |
| jvmRun | 289–389 | 10% | `java Main` — JVM bootstrap + test execution |
| parseResults | 0 | 0% | Split stdout on `---\n` delimiters |
| **Total** | **3,164–3,674** | — | — |

### Confirmed on group-anagrams/cpp (2 observations)

| Stage | Time (ms) |
|---|---|
| compile | 2,976–3,288 |
| jvmRun | 330–352 |
| Total | 3,341–3,674 |

### End-to-end context (Python Run)

| Stage | Time (ms) | What |
|---|---|---|
| loadMetadata | 0–4 | Read problem metadata.json |
| compile (user) | 38–138 | Python: container acquire + file upload (no compilation step) |
| execute (user) | 29–95 | `python -B -u main.py` |
| **judge (Marker)** | **3,164–3,674** | Full Marker pipeline above |
| **Total Run** | **3,298–3,629** | — |

### End-to-end context (C++ Run)

| Stage | Time (ms) | What |
|---|---|---|
| loadMetadata | 0–4 | Read problem metadata.json |
| compile (user) | 1,040–1,129 | `g++ -std=c++17 -O2` |
| execute (user) | 29–32 | `./main` |
| **judge (Marker)** | **3,341–3,674** | Full Marker pipeline |
| **Total Run** | **4,415–4,837** | — |

## Files Compiled per Marker Invocation

| File | Source | Changes between requests? |
|---|---|---|
| `ListNode.java` | `javaUtil.ts` constant | Never |
| `TreeNode.java` | `javaUtil.ts` constant | Never |
| `GraphNode.java` | `javaUtil.ts` constant | Never |
| `Marker.java` | `problems/<slug>/Marker.java` | Only when the problem's validator is edited |
| `Main.java` | Generated per request | **Every request** — embeds test inputs and user outputs |

Four of five files are constant for a given problem. Only `Main.java` changes.

## Reusability Assessment

| Artifact | Reusable? | Scope |
|---|---|---|
| `ListNode.class`, `TreeNode.class`, `GraphNode.class` | Yes | Global — same across all problems |
| `Marker.class` (+ any inner classes) | Yes | Per-problem — changes only when `Marker.java` is edited |
| `Main.class` | No | Per-request — embeds user outputs |
| JVM startup (~300ms) | No (per invocation) | Could be amortised with a persistent worker, but much higher complexity |

## Conclusion

**`javac` compilation of constant files accounts for ~85% of Marker overhead (2.7–3.3 seconds).** Pre-compiling the constant files (helper classes + Marker.java) and caching the `.class` artifacts would eliminate this cost on cache hits. Only `Main.java` would need compilation on each request — a single file against an existing classpath, expected to take tens of milliseconds instead of seconds.

JVM startup (~300ms) remains per invocation and is not addressed by compilation caching.
