# Judge Performance Baseline

**Date:** 2026-10-28
**Branch:** `perf/judge-latency-and-product-alignment`
**Milestone:** M2.5

---

## Problem Statement

The product owner reports that both Run (sample tests) and Submit (hidden tests) feel slow in the current web application. This document captures the pre-optimisation pipeline analysis and identifies bottlenecks.

## Execution Pipeline

A single Run or Submit request flows through these stages:

```
Client click
  → POST /api/run (or /api/submit)
    → ensureUserContentSeeded()
    → Read metadata.json
    → Create ProgramRunner
    → runner.compile()
      → ContainerPool.acquire() or docker.createContainer() + start()
      → tar pack source files → container.putArchive()
      → ensureTimeInstalled()              ← BOTTLENECK (see below)
      → [compile command: g++/javac]       (C++/Java only)
    → runner.run()
      → container.exec(wrapWithMetrics(cmd))
      → Parse stdout into per-test results
      → Release container to pool
    → judgeRawResults()
      → [For non-Java: getMarkerResponses()  ← separate Java container]
  → job.status = 'completed'
  ← Client polls GET /api/run?jobId=... every 600ms
  ← Result displayed
```

## Identified Bottlenecks

### 1. `ensureTimeInstalled()` — HIGH IMPACT

**Location:** `src/lib/runners/ProgramRunner.ts:47`

Every compile call runs `ensureTimeInstalled()`, which attempts to install `/usr/bin/time` via `apt-get` or `apk`. With M1's `NetworkMode: 'none'` (all execution containers), the package manager cannot reach any repository. The command:

```sh
command -v /usr/bin/time >/dev/null 2>&1 || timeout 45 sh -c '
  (apt-get update -qq -o Acquire::http::Timeout=5 ... && apt-get install -y -qq time)
  || (apk add --no-cache time)
' || true
```

**Behaviour with NetworkMode:'none':**
- `command -v /usr/bin/time` → fails (not installed on slim images)
- `apt-get update` → DNS/connect timeout (5s per attempt, multiple retries)
- Total: **5-15 seconds wasted per compile**, every time

**Why it exists:** Provides accurate memory metrics via `/usr/bin/time -f`. But `wrapWithMetrics()` already has an offline fallback that uses plain `timeout` and internal `:::TIME:::` markers for execution time. The `/usr/bin/time` install is a best-effort enhancement, not required for correctness.

**Impact:** This is the dominant contributor to perceived latency. Every Run adds 5-15 seconds of pure waste. Every Submit does the same per batch.

### 2. Frontend polling interval — MEDIUM IMPACT

**Location:** `src/lib/components/ExecutionPanel.svelte:613, 767`

The UI polls for results with a fixed `await delay(600)` (600ms). This means even after the server finishes, the user waits up to 600ms for the next poll to detect completion. For a fast execution (e.g., Python two-sum taking ~200ms server-side), this doubles the perceived latency.

### 3. Container creation cold start — LOW-MEDIUM IMPACT

When the `ContainerPool` is empty (first run, or after cleanup), a new container must be created and started. This involves:
- `docker.createContainer()` — Docker API call
- `container.start()` — Container boot

This takes 500-2000ms depending on the host. After the first run, the pool retains up to 2 idle containers per image, so subsequent runs reuse them.

### 4. Container cleanup between reuses — LOW IMPACT

`ContainerPool.cleanContainer()` runs `rm -rf /tmp/*; rm -f /app/*.java ...` via `container.exec()`. This takes 100-300ms per acquire. Necessary for correctness isolation but adds latency.

### 5. Marker container for Python/C++ — MEDIUM IMPACT

For Python and C++ submissions, user output is validated by running `Marker.java` in a separate Java container (`getMarkerResponses()` in `markerRunner.ts`). This requires:
- Acquiring a second Java container from the pool (or creating one)
- Uploading Marker.java + Main.java
- Compiling (`javac *.java`)
- Running (`java Main`)
- Parsing results

This adds a full second container lifecycle to every non-Java Run and Submit.

### 6. M1 resource restrictions — LOW IMPACT

The 512MB memory and 1 CPU limits from ADR-0003 are appropriate for execution correctness and should not materially affect typical problem solving. Compilation (especially Java's `javac`) may be slightly slower with 1 CPU, but this is a small contributor compared to items 1-2.

## Benchmark Problems

| Problem | Purpose | Sample Tests | Hidden Tests |
|---|---|---|---|
| `two-sum` | Simple baseline | 2 | ~25 |
| `binary-search` | Small numerical | 2 | ~20 |
| `group-anagrams` | Collection serialization | 2 | ~25 |
| `lru-cache` | Stateful/class-based | 2 | ~20 |
| `minimum-window-substring` | Complex algorithm | 2 | ~25 |

## Benchmark Configuration

- Languages: Python 3.11, C++17 (GCC 13), Java 22
- Repetitions: 5 measured runs after 2 warmup
- Metrics: total wall-clock time from POST to result ready
- Polling: 100ms interval in benchmark script (measuring server latency, not UI delay)

## Pre-Optimisation Measurements

To be populated by running `node scripts/benchmark-judge.mjs --json docs/performance/baseline-results.json` against the unoptimised codebase.

**Note:** Actual measurements require Docker Desktop running and the dev server started. The benchmark script captures wall-clock timings, poll counts, and per-sample data.

## Environment

- Host: macOS, Apple Silicon (ARM64)
- Docker Desktop: 29.4.3
- Node.js: v26.0.0
- Runner images: `python:3.11-slim`, `gcc:13`, `alpine/java:22-jdk`
- Container limits: 512MB memory, 1 CPU, 256 PIDs, NetworkMode: none
