# ADR-0003: Docker Container Security Hardening

**Status:** Accepted

**Date:** 2026-10-28

## Context

Cojudge's Docker-based code execution runs containers with no resource limits, unrestricted network access, default Linux capabilities, and the root user. While DevPrep is a single-user, offline-only application — meaning the user runs their own code on their own machine — defense-in-depth is appropriate to prevent accidental resource exhaustion and to establish a security baseline before any future network-accessible deployment.

The [Docker security review](../feasibility/docker-security-review.md) identified these gaps as Priority 1 (before release) and Priority 2 (hardening) items.

## Decision

Add a shared `HostConfig` to all container creation calls via `src/lib/server/containerConfig.ts`.

### Controls implemented

| Control | Value | Rationale |
|---|---|---|
| Memory | 512 MB (`Memory: 536870912`, `MemorySwap: 536870912`) | Prevents runaway allocations; swap disabled to avoid disk thrashing |
| CPU | 1 core (`NanoCpus: 1000000000`) | Prevents CPU monopolisation |
| PIDs | 256 (`PidsLimit: 256`) | Prevents fork bombs |
| Network | Disabled (`NetworkMode: 'none'`) | Prevents exfiltration and external downloads. Exception: debug containers retain network access for package installation |
| Capabilities | All dropped (`CapDrop: ['ALL']`) | Minimises kernel attack surface |
| Privilege escalation | Blocked (`SecurityOpt: ['no-new-privileges']`) | Prevents setuid/setgid escalation |

Applied to all 18 `docker.createContainer()` calls: 8 language runners, 8 playground runners, 1 marker runner, and 1 debug runner (with relaxed `NetworkMode`).

Container cleanup between reuses enhanced: file artifacts and `/tmp` are removed first, then leftover processes (PID > 1, excluding the cleanup shell) are killed individually. The file cleanup runs before process killing so that a killed shell cannot prevent cleanup.

### Controls deferred

| Control | Reason deferred | Priority |
|---|---|---|
| Read-only root filesystem + tmpfs | Requires per-image testing (Debian/Alpine). May break `ensureTimeInstalled` and other system writes. | P2 |
| Non-root user (`User: '1000:1000'`) | Breaks package installation. Already mitigated by `NetworkMode: 'none'`. | P2 |
| gVisor / runsc | Infrastructure complexity. Standard Docker isolation is sufficient for single-user offline use. | P3 |
| Fresh containers per execution | ~3-5 second performance cost per run. Enhanced cleanup is adequate for single-user. | P3 |

## Alternatives Considered

### No hardening

Acceptable for single-user offline use per the existing security review, but leaves no protection against accidental resource exhaustion (e.g., infinite loops allocating memory) and no baseline for future deployment scenarios.

### Per-runner configuration

Each language runner could define its own limits (e.g., Java gets more memory). Rejected in favour of uniform limits: simpler to maintain, easier to audit, and 512 MB is sufficient for all tested workloads. If specific runners need different limits, the shared function can accept overrides later.

## Consequences

**Positive:**

- Resource exhaustion from user code is bounded.
- No network exfiltration from execution containers.
- Reduced kernel attack surface via capability dropping.
- Consistent security posture across all language runners and the marker.
- Cleanup between container reuses is more thorough.

**Negative:**

- Memory metrics from `/usr/bin/time` are unavailable: `ensureTimeInstalled()` fails with no network (graceful fallback to plain `timeout` works; execution time is still measured via internal `:::TIME:::` markers).
- Debug containers retain network access. `DebugRunner` installs debugger packages at runtime: GDB via `apt-get` for C++ and Delve via `go install` for Go (see `DebugRunner.ts` lines 442-453). These installs require network. Debug containers are only created during interactive debugging sessions (never for submission grading), are labelled `cojudge.debug=true`, and still receive all other security controls (resource limits, capability dropping, no-new-privileges). Risk: user code in a debug session can make network requests. Acceptable for single-user local use.

## Related

- Files: `src/lib/server/containerConfig.ts`, `src/lib/server/containerConfig.test.ts`, all runners in `src/lib/runners/`, `src/lib/markerRunner.ts`
- Evidence: `containerConfig.test.ts` unit tests, M0.1 regression suite (78/78)
- Prior analysis: [docs/feasibility/docker-security-review.md](../feasibility/docker-security-review.md)
