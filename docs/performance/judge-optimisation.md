# Judge Performance Optimisation Report

**Date:** 2026-10-28
**Branch:** `perf/judge-latency-and-product-alignment`
**Milestone:** M2.5

---

## Changes Implemented

### 1. Skip `ensureTimeInstalled()` for offline containers

**Files:** `src/lib/runners/ProgramRunner.ts`

**Problem:** Every compile call ran `ensureTimeInstalled()`, which checks for `/usr/bin/time` and attempts package installation if absent. With `NetworkMode: 'none'`, the install always fails.

**Fix:** Check `container.inspect()` for `NetworkMode: 'none'` and skip the shell command entirely. Cache the check per container ID to avoid redundant Docker API calls on container reuse.

**Measured impact:** With `NetworkMode: 'none'`, DNS/connect failure occurs quickly (~50-200ms) on this host, not the projected 5-15 seconds. The optimisation saves that shell exec overhead but does not produce a dramatic latency reduction. See "Before/After Comparison" below for actual numbers.

**Why the original estimate was wrong:** The 5-15 second estimate assumed `apt-get update` would wait for HTTP timeouts (`Acquire::http::Timeout=5` × multiple retries). In practice, with `NetworkMode: 'none'`, there is no network stack at all — DNS resolution fails immediately, and the shell command exits within ~100ms on this host.

### 2. Adaptive frontend polling

**Files:** `src/lib/components/ExecutionPanel.svelte`

**Fix:** Replaced fixed 600ms polling with adaptive delay: starts at 150ms, multiplies by 1.5× each poll, caps at 1000ms. Resets when a new job starts.

**Measured impact:** Reduces time between server completion and UI update from 0-600ms (uniform) to 0-150ms for the first poll, improving perceived responsiveness for fast jobs.

### 3. Development-only performance instrumentation

**Files:** `src/lib/server/perfTimer.ts`, `src/routes/api/run/+server.ts`, `src/routes/api/submit/+server.ts`

Records per-stage timings (loadMetadata, compile, execute, judge) with outcome tracking (ok/error/timeout). Enabled via `COJUDGE_PERF=1`. Logs to server stdout only — never logs user code or hidden-test data.

### 4. Benchmark tooling

**Files:** `scripts/benchmark-judge.mjs`

Loads solutions from `tests/judge/fixtures/` (same verified references used by the 78-test judge regression suite). Handles multi-batch submit correctly. Excludes measurements where correct solutions produce wrong verdicts, errors, or timeouts.

## Before/After Comparison

Same environment, same problems, same solutions. Baseline = main branch (M1); Optimised = this PR.

### Run Latency (median ms)

| Problem | Language | Baseline | Optimised | Change |
|---|---|---|---|---|
| two-sum | python | 3,334 | 3,327 | -7 (0.2%) |
| two-sum | cpp | 4,141 | 4,047 | -94 (2.3%) |
| two-sum | java | 3,321 | 3,322 | +1 (0.0%) |
| binary-search | python | 3,321 | 3,379 | +58 (1.7%) |
| binary-search | cpp | 3,982 | 3,935 | -47 (1.2%) |
| binary-search | java | 3,319 | 3,313 | -6 (0.2%) |
| group-anagrams | python | 3,519 | 3,521 | +2 (0.1%) |
| group-anagrams | cpp | 4,350 | 4,339 | -11 (0.3%) |
| group-anagrams | java | 3,520 | 3,519 | -1 (0.0%) |
| lru-cache | python | 3,548 | 3,449 | -99 (2.8%) |
| lru-cache | cpp | 4,275 | 4,276 | +1 (0.0%) |
| lru-cache | java | 3,555 | 3,593 | +38 (1.1%) |
| min-window-substr | python | 3,338 | 3,344 | +6 (0.2%) |
| min-window-substr | cpp | 4,067 | 3,963 | -104 (2.6%) |
| min-window-substr | java | 3,391 | 3,340 | -51 (1.5%) |

### Submit Latency (median ms)

| Problem | Language | Baseline | Optimised | Change |
|---|---|---|---|---|
| two-sum | python | 7,068 | 7,155 | +87 (1.2%) |
| two-sum | cpp | 8,507 | 8,545 | +38 (0.4%) |
| two-sum | java | 7,308 | 7,258 | -50 (0.7%) |
| binary-search | python | 7,259 | 7,247 | -12 (0.2%) |
| binary-search | cpp | 8,694 | 8,756 | +62 (0.7%) |
| binary-search | java | 7,411 | 7,461 | +50 (0.7%) |
| group-anagrams | python | 3,837 | 3,887 | +50 (1.3%) |
| group-anagrams | cpp | 4,849 | 4,758 | -91 (1.9%) |
| group-anagrams | java | 4,047 | 4,044 | -3 (0.1%) |
| lru-cache | python | 12,650 | 12,343 | -307 (2.4%) |
| lru-cache | cpp | 15,485 | 15,239 | -246 (1.6%) |
| lru-cache | java | 12,972 | 13,056 | +84 (0.6%) |
| min-window-substr | python | 3,657 | 3,597 | -60 (1.6%) |
| min-window-substr | cpp | 4,386 | 4,389 | +3 (0.1%) |
| min-window-substr | java | 3,768 | 3,814 | +46 (1.2%) |

### Assessment

**The `ensureTimeInstalled` optimisation does not produce a measurable latency improvement on this host.** Changes are within normal measurement variance (±1-3%). The original bottleneck analysis was based on code reading, not runtime measurement. With `NetworkMode: 'none'`, DNS failure is immediate and the `ensureTimeInstalled` shell command adds only ~50-200ms — not seconds.

**The optimisation is still correct and worthwhile:**
- It removes a known-futile shell exec from the hot path.
- On hosts with slower DNS timeout (Linux, different Docker backends, VPN configurations), the savings could be larger.
- The `container.inspect()` check is cached per container ID, so subsequent runs on the same container add zero overhead.

**The adaptive polling improvement** (600ms → 150ms initial) is real but not captured by the benchmark script, which uses its own 100ms polling. The improvement is in **perceived UI responsiveness**, not server latency.

## True Bottleneck: Marker Container Lifecycle

The dominant contributor to latency is the **Marker validation stage** for Python and C++:

```
[perf] run two-sum/python 4694ms | loadMetadata=0ms compile=144ms execute=105ms judge=4445ms
```

The `judge` stage accounts for 75-95% of total Run latency for non-Java languages. It involves a full second container lifecycle:

1. Acquire Java container from pool (or create new one)
2. Upload Marker.java + test harness via tar
3. Compile with `javac *.java` (~500ms-2s)
4. Run `java Main` (~300ms-1s including JVM startup)
5. Parse results

### Future Optimisation Opportunities (Not Implemented)

| Idea | Expected Impact | Complexity | Risk |
|---|---|---|---|
| Pre-compile Marker.java once per problem | High — eliminates repeated `javac` for the same Marker | Medium | Must invalidate on Marker changes |
| Keep Marker container warm between requests | Medium — saves container create/acquire overhead | Low | Memory usage when idle |
| Merge Marker into Python/C++ containers | High — eliminates second container entirely | High | Requires Java in Python/C++ images; changes security boundary |
| Stream results via SSE instead of polling | Low for server latency; high for perceived UI delay | Medium | New infrastructure |

These require architectural review and are documented for future milestones.

## Regression Verification

All test suites pass after optimisations:

| Suite | Count | Result |
|---|---|---|
| Unit tests (Vitest) | 244 | 244/244 pass |
| Judge regression (verify-judge.mjs) | 78 | 78/78 pass |
| Security integration | 13 | 13/13 pass |
| Type check (svelte-check) | — | 32 pre-existing errors, 0 new |
| Production build | — | Success |
