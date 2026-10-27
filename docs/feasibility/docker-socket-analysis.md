# Docker Socket Exposure Analysis

**Date:** 2026-10-28
**Scope:** DevPrep / Cojudge v0.8.8 Docker daemon access

---

## 1. Current Architecture

All Docker operations use the [Dockerode](https://github.com/apocas/dockerode) library, connecting to the Docker daemon via the Unix socket at `/var/run/docker.sock`.

### Components requiring Docker API access

| Component | File | Operations |
|---|---|---|
| Python runner | `src/lib/runners/PythonRunner.ts` | Create, start, exec, archive upload |
| C++ runner | `src/lib/runners/CppRunner.ts` | Create, start, exec, archive upload |
| Java runner | `src/lib/runners/JavaRunner.ts` | Create, start, exec, archive upload |
| Go / Rust / C# / PHP / TS runners | `src/lib/runners/*.ts` | Same pattern |
| Playground runners | `src/lib/runners/PlaygroundRunners.ts` | Same pattern (8 languages) |
| Debug runner | `src/lib/runners/DebugRunner.ts` | Create, start, exec, file transfer |
| Marker runner | `src/lib/markerRunner.ts` | Create, start, exec (Java validation) |
| Container pool | `src/lib/runners/ContainerPool.ts` | Inspect, stop, remove |
| Cleanup cron | `src/lib/server/cleanup.ts` | List, stop, remove (orphan cleanup) |
| Image puller | `src/lib/server/imagePuller.ts` | Pull, inspect |

All 10 components instantiate `new Dockerode()` independently — they share no centralised Docker client.

### Deployment modes

1. **Local development / CLI:** Node.js process accesses the host Docker socket directly.
2. **Containerised (`docker.sh`):** Application container bind-mounts `/var/run/docker.sock`, creating sibling containers on the host.

---

## 2. Risk Assessment

### Single-user local deployment (DevPrep v1.0 scope)

The user already has Docker access — DevPrep adds no new privilege. The Unix socket is not exposed over TCP by default. The application and all execution containers run on the same host under the same user's authority.

**Risk: LOW.** The Docker socket grant is equivalent to the access the user already has.

### Containerised deployment

When running via `docker.sh`, the application container has full Docker daemon access via the mounted socket. This is equivalent to root on the host. For single-user offline use, this is an acceptable trade-off — the user controls both the host and the container.

**Risk: LOW (single-user).** Would be HIGH for any multi-user or network-accessible deployment.

---

## 3. Reduction Options Evaluated

### A. Restrict to localhost

**Status: Already the case.** The Docker daemon listens on a Unix socket (`/var/run/docker.sock`), not a TCP port. No configuration change needed.

### B. TCP exposure

**Status: Not used.** Docker's TCP listener (typically port 2375/2376) is not enabled. **Recommendation:** Document that TCP exposure must never be enabled for DevPrep deployments. Add a warning to deployment documentation.

### C. Process separation

A dedicated executor process would hold the Docker socket while the web server communicates via IPC (Unix socket, HTTP, or message queue). The web server would have no direct Docker access.

**Status: Deferred.** Feasible but adds significant complexity (process management, IPC protocol, error propagation, lifecycle coordination) for minimal benefit in single-user local deployment. Would become a prerequisite for any multi-user deployment.

### D. Docker-in-Docker

Running Docker inside a Docker container to isolate the execution engine from the host daemon.

**Status: Rejected.** Adds infrastructure complexity, performance overhead (nested storage drivers), and nested container management. Not justified for single-user use.

### E. Docker socket proxy

Tools like [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) can restrict which Docker API endpoints are accessible.

**Status: Deferred.** Useful for limiting the application to only `containers` endpoints (blocking `volumes`, `networks`, `exec` on host). Overkill for single-user offline use. Worth revisiting if the threat model changes.

---

## 4. Recommendations

1. **Do not expose the Docker socket over TCP.** Add a warning to deployment documentation.
2. **Document that DevPrep's Docker access is equivalent to host root access.** Users should understand this when running the containerised deployment.
3. **If multi-user deployment is ever considered**, process separation (Option C) and socket proxying (Option E) become mandatory prerequisites. Create an ADR before implementing.
4. **Current architecture is acceptable for v1.0** (single-user, offline, local).

---

## 5. Code Changes

None required. This analysis documents the current state and deferred options.
