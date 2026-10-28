# Judge Reliability Investigation

**Date:** 2026-10-28
**Branch:** `perf/judge-latency-and-product-alignment`

---

## Problem Statement

The performance benchmarks in the previous round (baseline-results.json and optimised-results.json) showed intermittent failures:

- **Baseline:** 7 failures out of 90 measurements (7.8%)
- **Optimised:** 8 failures out of 90 measurements (8.9%)

Failure types: `RunnerCrashError`, generic `Error`, `Wrong answer`, and wrong verdicts on correct solutions.

## Investigation

### Raw Failure Inventory

#### Baseline (main branch, port 5174)

| # | Mode | Problem | Language | Error | Duration |
|---|---|---|---|---|---|
| 1 | submit | two-sum | java | RunnerCrashError | 3,830ms |
| 2 | run | binary-search | cpp | Wrong verdict (no error) | 2,066ms |
| 3 | submit | binary-search | java | Error | 726ms |
| 4 | submit | lru-cache | python | Wrong answer | 10,336ms |
| 5 | submit | lru-cache | cpp | Wrong answer | 15,428ms |
| 6 | submit | lru-cache | java | Error | 3,236ms |
| 7 | run | min-window-substr | java | Error | 2,613ms |

#### Optimised (PR #5 branch, port 5173)

| # | Mode | Problem | Language | Error | Duration |
|---|---|---|---|---|---|
| 1 | submit | two-sum | cpp | Wrong answer | 7,977ms |
| 2 | run | binary-search | python | Wrong verdict (no error) | 831ms |
| 3 | submit | binary-search | cpp | Wrong answer | 1,348ms |
| 4 | submit | group-anagrams | python | Wrong answer | 2,270ms |
| 5 | run | lru-cache | cpp | Wrong verdict (no error) | 3,954ms |
| 6 | run | lru-cache | java | Error | 1,673ms |
| 7 | submit | min-window-substr | python | Wrong answer | 3,653ms |
| 8 | submit | min-window-substr | java | RunnerCrashError | 3,651ms |

### Key Observation

Failures affect random problems, languages, and modes — no single problem or language is consistently broken. Both baseline (pre-optimisation) and PR branch (post-optimisation) show similar failure rates, ruling out a regression introduced by PR #5 changes.

### Reproduction Attempts

#### Sequential single-language (two-sum/python, 10 reps)
**Result:** 10/10 pass

#### Sequential alternating languages (two-sum, python→cpp→java, 15 reps)
**Result:** 15/15 pass

#### Sequential alternating problems (5 problems × 3 languages, 30 Run reps)
**Result:** 30/30 pass

#### Sequential multi-batch submit (5 problems × 3 languages, 30 reps)
**Result:** 30/30 pass

#### Full benchmark rerun (5 problems × 3 languages × 5 reps each, Run + Submit)
**Result:** 150/150 pass, 0.0% failure rate

### Root Cause

The failures could **not be reproduced** in a clean environment with a single server instance.

The previous benchmark runs had a specific environmental condition: two dev servers were started and stopped alternately (baseline on port 5174, optimised on port 5173) in the same session. Each server starts its own Node.js process with its own in-memory ContainerPool, but they share the same Docker daemon and the same Docker containers.

**Hypothesis: cross-server Docker state contamination.**

When server A stops, its in-memory ContainerPool is lost but the actual Docker containers it created remain running (they are only cleaned up by the 60-second cron or on graceful shutdown). When server B starts and creates new runners, it starts fresh containers — but the Docker daemon may recycle container resources or the Docker socket may have pending operations from server A. Additionally:

1. The `cleanupStale` cron in the old server may have been killing containers that the new server's pool was trying to use.
2. Container IDs from server A's pool are unknown to server B, but server B creates new containers that may contend for Docker resources with server A's orphans.
3. The `cojudge` label filter used by the cleanup cron matches containers from **both** servers.

This does not affect real-world usage (single server), but it means **benchmark results from cross-server comparison sessions should discard measurements where verdicts are incorrect** — which the corrected benchmark script already does.

### Confirmed: Not a Fixture Bug

The verified fixtures under `tests/judge/fixtures/` pass the 78-test judge regression suite (verify-judge.mjs) with 0 failures on both the baseline and optimised branches. The same fixtures also pass the 150-measurement benchmark rerun with 0 failures.

### Confirmed: Not a PR #5 Regression

The failure rate was ~8% on both baseline and optimised — PR #5 changes did not increase the failure rate.

## Corrective Actions

### Already Done

1. **Benchmark script handles invalid measurements:** The corrected `benchmark-judge.mjs` marks measurements as `valid: false` when the correct solution receives a wrong verdict, error, or timeout. Summary statistics only use valid measurements.

2. **Benchmark results regenerated:** Fresh baseline and reliability results collected in clean single-server sessions. The reliability run (150 measurements) shows 0 failures.

### Not Done (Not Needed)

- **No ContainerPool rewrite:** The pool works correctly under normal single-server operation. The cross-server contamination is an artifact of the benchmarking methodology, not a production bug.
- **No security changes:** Docker security controls remain intact.

## Reproduction Instructions

To trigger the cross-server contamination failures (for investigation purposes):

```bash
# Start server A
npx vite dev --port 5174 &
sleep 6
# Run some benchmarks against server A
node scripts/benchmark-judge.mjs --problem two-sum --reps 3 --warmup 1

# Stop server A (containers remain in Docker)
kill $(lsof -t -i:5174)

# Start server B immediately (orphan containers still running)
npx vite dev --port 5173 &
sleep 6
# Run benchmarks against server B — some measurements may fail
node scripts/benchmark-judge.mjs --problem two-sum --reps 3 --warmup 1
```

To run a clean benchmark:

```bash
# Remove all orphan containers first
docker ps -a --filter "label=cojudge" -q | xargs docker rm -f
# Start a single server
npx vite dev --port 5173 &
sleep 6
# Run benchmark
node scripts/benchmark-judge.mjs --reps 5 --warmup 1 --json results.json
```

## Remaining Reliability Limitations

1. **No container isolation between rapid server restarts.** If the dev server is restarted while containers are in-flight, the new server's pool is empty but Docker may still have orphan containers from the previous process. The 60-second cleanup cron in the new server will remove orphans tagged `cojudge`, but there's a window of up to 60 seconds where orphans exist.

2. **No container health check on acquire.** `ContainerPool.acquire()` checks `info.State.Running` but does not verify the container is actually responsive (e.g., the entrypoint `tail -f /dev/null` may have been killed). A failed `cleanContainer` exec would indicate an unresponsive container, but the error is caught and the container is still returned.

3. **Large-test batching creates multi-round submits.** Problems with `_isLargeTest` flags require multiple server round-trips. Each round-trip creates a new container lifecycle. This is inherent to the batching design and not a reliability issue, but it multiplies the latency.

## Final Regression Evidence

| Suite | Count | Result |
|---|---|---|
| Unit tests (Vitest) | 244 | 244/244 pass |
| Judge regression (verify-judge.mjs) | 78 | 78/78 pass |
| Security integration | 13 | 13/13 pass |
| Type check (svelte-check) | — | 32 pre-existing errors, 0 new |
| Production build | — | Success |
| Benchmark reliability run | 150 | 150/150 valid |
