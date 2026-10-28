# Judge Performance Baseline

**Date:** 2026-10-28
**Branch:** `perf/judge-latency-and-product-alignment`
**Milestone:** M2.5

---

## Problem Statement

The product owner reports that both Run (sample tests) and Submit (hidden tests) feel slow in the current web application.

## Environment

| Property | Value |
|---|---|
| Host | macOS, Apple Silicon (ARM64), Apple M4 |
| Memory | 24 GB |
| Docker Desktop | 29.4.3 |
| Node.js | v26.0.0 |
| Runner images | `python:3.11-slim`, `gcc:13`, `alpine/java:22-jdk` |
| Container limits | 512 MB memory, 1 CPU, 256 PIDs, NetworkMode: none |
| Benchmark polling interval | 100ms (not the UI's 600ms) |

## Execution Pipeline

```
Client click
  → POST /api/run (or /api/submit)
    → ensureUserContentSeeded()
    → Read metadata.json
    → Create ProgramRunner
    → runner.compile()
      → ContainerPool.acquire() or docker.createContainer() + start()
      → tar pack source files → container.putArchive()
      → ensureTimeInstalled()
      → [compile: g++/javac]         (C++/Java only)
    → runner.run()
      → container.exec(timeout <cmd>)
      → Parse stdout
      → Release container to pool
    → judgeRawResults()
      → [For Python/C++: getMarkerResponses() ← separate Java container]
  → job.status = 'completed'
  ← Client polls GET every 600ms
  ← Result displayed
```

## Measured Server-Side Stage Timings (COJUDGE_PERF=1)

From instrumented runs of `two-sum`:

| Stage | Python | Java | What it includes |
|---|---|---|---|
| loadMetadata | 0-3ms | 0-3ms | Content seeding check, file read, JSON parse |
| compile | 67-144ms | 3,312-4,011ms | Container acquire/create, tar upload, ensureTimeInstalled, compilation |
| execute | 64-105ms | 422-458ms | Test runner execution inside container |
| judge | 3,249-4,445ms | 0-1ms | Marker validation (separate Java container for Python/C++) |
| **total** | **3,370-4,694ms** | **3,767-4,436ms** | — |

### Key Insight

The dominant bottleneck differs by language:

- **Python/C++:** The `judge` stage (Marker validation in a separate Java container) accounts for 75-95% of total Run latency. The Marker container requires: pool acquire or create, tar upload, `javac *.java`, `java Main`, result parsing.
- **Java:** The `compile` stage dominates because Java compilation (`javac *.java`) is inherently slow (~1-3s), plus container lifecycle overhead. Marker validation is inline (0ms) since Java merges the Marker into the same compilation.

## Baseline Measurements (Pre-Optimisation)

5 problems × 3 languages, 3 reps after 1 warmup. Server: main branch (M1 code).

### Run Latency (sample tests, median ms)

| Problem | Python | C++ | Java |
|---|---|---|---|
| two-sum | 3,334 | 4,141 | 3,321 |
| binary-search | 3,321 | 3,982 | 3,319 |
| group-anagrams | 3,519 | 4,350 | 3,520 |
| lru-cache | 3,548 | 4,275 | 3,555 |
| minimum-window-substring | 3,338 | 4,067 | 3,391 |

### Submit Latency (hidden tests, median ms)

| Problem | Tests | Python | C++ | Java |
|---|---|---|---|---|
| two-sum | 31 | 7,068 | 8,507 | 7,308 |
| binary-search | 51 | 7,259 | 8,694 | 7,411 |
| group-anagrams | 32 | 3,837 | 4,849 | 4,047 |
| lru-cache | 55 | 12,650 | 15,485 | 12,972 |
| minimum-window-substring | 30 | 3,657 | 4,386 | 3,768 |

### Observations

- **Run latency is 3.3-4.4 seconds** regardless of problem complexity — dominated by container lifecycle and Marker/compilation overhead.
- **Submit latency scales with test count** — lru-cache (55 hidden tests) takes 3-4× longer than minimum-window-substring (30 tests).
- **C++ is consistently ~1 second slower than Python/Java** for Run — g++ compilation adds overhead.
- **Some intermittent errors** (container reuse race conditions) — inherent to Cojudge's container pool, not introduced by M1 changes.
- **Frontend 600ms polling** adds up to 600ms delay after server completion before the user sees the result.

## Benchmark Tool

```bash
# Full suite
node scripts/benchmark-judge.mjs --json docs/performance/baseline-results.json

# Single problem/language
node scripts/benchmark-judge.mjs --problem two-sum --lang python --reps 5

# With perf instrumentation
COJUDGE_PERF=1 npm run dev  # separate terminal
node scripts/benchmark-judge.mjs --problem two-sum --reps 1 --warmup 0
```

Solutions are loaded from `tests/judge/fixtures/` (same verified references used by the 78-test judge regression suite).
