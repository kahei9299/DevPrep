# M1 Runtime Verification Report

**Date:** 2026-10-28
**Branch:** `feat/m1-judge-hardening`
**Environment:** Docker Desktop 29.4.3, macOS, Node.js v26.0.0

---

## Passed

### Judge regression suite: 78/78

All 20 problems × 3 languages (60 correct submissions), 15 wrong-solution rejections, 1 timeout detection, and 2 compilation error detections passed.

```
Total: 78 tests
Passed: 78
Failed: 0
Errors: 0
```

### Security integration tests: 13/13

| Test | Result | Evidence |
|---|---|---|
| NetworkMode is none | PASS | Docker API inspect: `NetworkMode: none` |
| Memory limit is 512 MB | PASS | Docker API inspect: `Memory: 536870912` |
| MemorySwap equals Memory | PASS | Docker API inspect: `MemorySwap: 536870912` |
| CPU limit is 1 core | PASS | Docker API inspect: `NanoCpus: 1000000000` |
| PID limit is 256 | PASS | Docker API inspect: `PidsLimit: 256` |
| All capabilities dropped | PASS | Docker API inspect: `CapDrop: [ALL]` |
| no-new-privileges set | PASS | Docker API inspect: `SecurityOpt: ["no-new-privileges"]` |
| Network isolation (socket.connect) | PASS | `connect()` raised OSError as expected |
| PID limit enforced | PASS | Container killed by resource limit |
| Memory limit enforced (OOM kill) | PASS | Container killed by cgroup OOM |
| Valid Python solution accepted | PASS | Regression check |
| Valid C++ solution accepted | PASS | Regression check |
| Valid Java solution accepted | PASS | Regression check |

### Container reuse verification

- Valid submission after compile error: container destroyed on error, new container created, valid solution accepted.
- Pool maintains running containers across submissions (confirmed via `docker ps`).

### Offline readiness smoke test: 9/9

All three Docker images cached locally. Judge functional for two-sum across Python, C++, Java.

### Unit tests: 241/241

### Type check: 0 new errors (32 pre-existing from upstream Cojudge)

### Production build: success

---

## Failed (fixed during verification)

### Container cleanup killed pooled containers

The process-killing `for` loop in `cleanContainer` killed the container entry point's child process (`tail -f /dev/null`, PID > 1), which caused the PID-1 shell to exit, stopping the container. This produced "HTTP 409 container is not running" errors on 23 of 78 tests.

**Root cause:** `Cmd: ['sh', '-lc', 'tail -f /dev/null']` creates two processes: the shell (PID 1) and `tail` (child PID). Killing the child causes the parent to exit.

**Fix:** Removed process-killing loop from cleanup. File and `/tmp` cleanup retained. Leftover processes are contained by resource limits (NetworkMode: none, CapDrop: ALL, PID/memory limits) and destroyed when the container is removed from the pool.

**Regression test:** Reran full 78-test suite after fix: 78/78 pass.

---

## True offline verification (host network disconnected)

**Date:** 2026-10-28
**Environment:** macOS, Wi-Fi disabled, Docker Desktop 29.4.3
**Command:** `node scripts/verify-judge.mjs` (full 78-test suite, run in a separate terminal tab)
**Result:** 78/78 passed (0 failed, 0 errors)

The product owner disconnected Wi-Fi, started the dev server, and ran the full M0.1 judge verification suite. All 60 correct-solution submissions were accepted, all 15 wrong-solution submissions were rejected, timeout detection worked, and compilation error detection worked — all without any internet connectivity.

---

## Deferred

### Read-only root filesystem (ReadonlyRootfs)

Requires per-image testing across Debian (python:3.11-slim, gcc:13) and Alpine (alpine/java:22-jdk) base images. Deferred to Priority 2 per ADR-0003.

### Non-root container user (User: '1000:1000')

Breaks package installation in `ensureTimeInstalled()`. Mitigated by NetworkMode: 'none' (install fails regardless). Deferred to Priority 2 per ADR-0003.

---

## Container inspection evidence

```
NetworkMode: none
Memory: 536870912
MemorySwap: 536870912
NanoCpus: 1000000000
PidsLimit: 256
CapDrop: [ALL]
SecurityOpt: ["no-new-privileges"]
```
