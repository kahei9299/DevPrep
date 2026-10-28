# Marker Compilation Cache — Benchmark Results

**Date:** 2026-10-28
**Branch:** `perf/marker-compilation-cache`

---

## Summary

Caching compiled Marker `.class` files eliminates the `javac` invocation (2.7–3.2s) on cache-hit requests for Python and C++. The cache key is a SHA-256 hash of `Marker.java` source, helper class sources, `javaHelperMethods`, and the harness signature (function name, parameter types, output type, interactive config). A data-driven `Main.java` reads test inputs from a runtime file instead of embedding them as source literals, so the compiled `Main.class` is also reusable across requests for the same problem.

Java runs are unaffected — they compile the Marker alongside user code in a merged path and do not use the separate Marker container.

## Environment

| Property | Value |
|---|---|
| Host | macOS ARM64, Apple M4, 24 GB |
| Docker | 29.4.3 |
| Node.js | v26.0.0 |
| Marker image | `alpine/java:22-jdk` |
| Benchmark | 5 reps after 1 warmup, 100ms poll interval |

## Before: PR #5 Baseline (median ms, clean single-server run)

### Run (sample tests)

| Problem | Python | C++ | Java |
|---|---|---|---|
| two-sum | 3,329 | 4,043 | 3,317 |
| binary-search | 3,418 | 4,037 | 3,635 |
| group-anagrams | 4,105 | 4,458 | 3,628 |
| lru-cache | 3,707 | 4,442 | 3,520 |
| min-window-substr | 4,236 | 4,346 | 5,200 |

### Submit (hidden tests)

| Problem | Tests | Python | C++ | Java |
|---|---|---|---|---|
| two-sum | 31 | 7,072 | 8,497 | 7,256 |
| binary-search | 51 | 7,256 | 8,990 | 7,562 |
| group-anagrams | 32 | 4,152 | 4,860 | 4,650 |
| lru-cache | 55 | 13,054 | 15,984 | 13,424 |
| min-window-substr | 30 | 3,833 | 4,752 | 4,499 |

## After: Marker Cache Enabled (median ms, warm cache, 150/150 valid)

### Run (sample tests)

| Problem | Python | C++ | Java |
|---|---|---|---|
| two-sum | 667 | 1,248 | 3,513 |
| binary-search | 620 | 1,139 | 3,317 |
| group-anagrams | 623 | 1,345 | 3,627 |
| lru-cache | 621 | 1,552 | 3,632 |
| min-window-substr | 625 | 1,150 | 3,733 |

### Submit (hidden tests)

| Problem | Tests | Python | C++ | Java |
|---|---|---|---|---|
| two-sum | 31 | 1,254 | 2,704 | 7,264 |
| binary-search | 51 | 1,344 | 2,694 | 7,461 |
| group-anagrams | 32 | 626 | 1,551 | 4,036 |
| lru-cache | 55 | 3,333 | 6,408 | 14,445 |
| min-window-substr | 30 | 631 | 1,449 | 3,840 |

## Improvement Summary

| Language | Metric | Before | After | Reduction |
|---|---|---|---|---|
| Python | Run median (typical) | 3,329–4,236ms | 620–667ms | **80–85%** |
| C++ | Run median (typical) | 4,037–4,458ms | 1,139–1,552ms | **65–72%** |
| Java | Run median | 3,317–5,200ms | 3,317–3,733ms | Unchanged |
| Python | Submit (30-test) | 3,833ms | 631ms | **84%** |
| Python | Submit (55-test) | 13,054ms | 3,333ms | **74%** |
| C++ | Submit (30-test) | 4,752ms | 1,449ms | **69%** |
| C++ | Submit (55-test) | 15,984ms | 6,408ms | **60%** |

## Instrumented Marker Stage Timings

### Cache miss (first request for a problem)

```
[perf] run two-sum/marker 3361ms | resolveMarker=0ms cacheCheck=0ms acquireContainer=88ms uploadSources=5ms compileAll=2930ms cacheStore=8ms jvmRun=329ms
```

### Cache hit (subsequent requests)

```
[perf] run two-sum/marker 388ms | resolveMarker=0ms cacheCheck=0ms acquireContainer=54ms uploadCached=4ms jvmRun=331ms
```

The `compileAll` stage (2.9s) is eliminated entirely on cache hit. The remaining overhead is container acquisition (54ms) and JVM startup for `java Main` (331ms).

## Why It Works

`javac` on `alpine/java:22-jdk` takes 2.7–3.2 seconds per invocation due to JVM bootstrap overhead for the compiler. This cost is incurred regardless of how many `.java` files are compiled. By caching all compiled `.class` files (Marker, helpers, and a data-driven Main) and feeding per-request test data via a netstring-encoded binary file (`data.bin`) instead of source literals, the `javac` invocation is skipped entirely on cache hit. The netstring format (`<byte-length>:<utf8-bytes>`) preserves embedded newlines, special characters, and trailing whitespace exactly.

## Reliability

- **150/150 measurements valid**, 0% failure rate.
- **78/78 judge regression tests pass** (correct accepted, wrong rejected, timeout/error detected).
- **13/13 security integration tests pass**.
- **274/274 unit tests pass** (including netstring encoding, cache integrity, harness signature tests).
- Cache miss falls back to full compilation with identical semantics.
- Runtime error on cache hit triggers eviction and falls back to the legacy inline-data harness.

## Remaining Bottlenecks

| Bottleneck | Affected | Typical overhead | Notes |
|---|---|---|---|
| C++ compilation (`g++`) | C++ Run/Submit | ~1,000ms | Inherent to the language |
| Java compilation (`javac` for user code) | Java Run/Submit | ~3,000ms | Merged Marker path; not addressed by this cache |
| JVM startup (`java Main`) | All Marker validations | ~300–400ms | Irreducible without a persistent JVM worker |
| Container acquire + upload | All | ~60ms | Already fast via pool reuse |
| Multi-batch submit | High-test-count problems | Linear in batch count | Each batch pays container + JVM overhead |
