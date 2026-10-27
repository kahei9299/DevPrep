# Docker Security Review

**Date:** 2026-10-27
**Scope:** Cojudge v0.8.8 Docker-based code execution

---

## 1. Architecture Overview

Cojudge uses Docker for code execution in two deployment modes:

1. **Local CLI / Dev mode:** Node.js process connects directly to the host Docker daemon
2. **Containerized (`docker.sh`):** Application container mounts the host Docker socket, spawning "sibling" containers

Both modes give the application full Docker API access via the `dockerode` library.

---

## 2. Docker Socket Exposure

### Finding: HOST_DOCKER_SOCKET_MOUNTED

**Severity: HIGH (for multi-user) / ACCEPTABLE (for single-user local)**

```bash
# From docker.sh:
docker run -d \
  -v "${HOST_DOCKER_SOCKET}:/var/run/docker.sock" \
  ...
```

The host Docker socket is bind-mounted into the application container. This grants the container full control over the Docker daemon, equivalent to root access on the host.

**Impact for DevPrep:** Since DevPrep is designed as a fully offline, single-user local application, this is an acceptable trade-off. The user already has Docker access. However, this architecture must never be exposed to untrusted network access.

---

## 3. Runner Container Security

### Finding: NO_RESOURCE_LIMITS

**Severity: MEDIUM**

Runner containers are created with default Docker settings — no resource constraints:

```typescript
// From PythonRunner.ts, CppRunner.ts, JavaRunner.ts:
this.container = await docker.createContainer({
    Image: pythonImage,
    Cmd: ['sh', '-lc', 'tail -f /dev/null'],
    WorkingDir: '/app',
    Tty: false,
    Labels: cojudgeContainerLabels()
    // No HostConfig with resource limits
});
```

| Control | Current | Recommended |
|---|---|---|
| Memory | Unlimited | 256 MB (`Memory: 268435456`) |
| CPU | Unlimited | 1 CPU (`NanoCpus: 1000000000`) |
| PIDs | Unlimited | 256 (`PidsLimit: 256`) |
| Network | Full host access | `NetworkMode: 'none'` |
| Capabilities | All default | `CapDrop: ['ALL']` |
| Filesystem | Read-write | `ReadonlyRootfs: true` with tmpfs for `/app` and `/tmp` |
| User | root | `User: '1000:1000'` |
| Seccomp | Default profile | Keep default (sufficient for our use case) |

### Finding: CONTAINERS_HAVE_NETWORK_ACCESS

**Severity: MEDIUM**

User code running inside containers can make arbitrary network requests. This could:
- Exfiltrate problem test cases or solutions
- Perform network attacks from the user's machine
- Download and execute malicious code

For single-user offline use this is low risk, but `NetworkMode: 'none'` should be set as defense-in-depth.

### Finding: CONTAINERS_RUN_AS_ROOT

**Severity: LOW (single-user context)**

All runner containers execute code as root. While the container provides isolation, running as a non-root user inside the container adds defense-in-depth.

---

## 4. Container Lifecycle Management

### Container Pool (ContainerPool.ts)

- Maintains up to 2 idle containers per image
- Containers are cleaned between uses (`rm -f /app/*.java /app/*.py ...`)
- Stale containers cleaned after 5 minutes of inactivity
- Session-scoped cleanup on shutdown using `cojudge.session` labels

### Cleanup Cron (cleanup.ts)

- Runs every 60 seconds
- Removes orphaned containers older than `EXECUTION_TIMEOUT + 10s` (40 seconds)
- Cross-session cleanup: removes any container with `cojudge.created=true` label that exceeds age threshold
- Handles debug containers separately (5-minute timeout)

### Finding: CLEAN_BETWEEN_USES_INSUFFICIENT

**Severity: LOW**

The container cleaning step removes known file extensions but does not clean:
- Environment variables set during execution
- Files in other directories (e.g., `/tmp`)
- Modified system files
- Background processes still running

For a single-user application, this is acceptable since the user runs their own code. For multi-user scenarios, fresh containers per execution would be needed.

---

## 5. Execution Timeout

- **Timeout:** 30 seconds via Linux `timeout` command
- **Implementation:** `timeout ${EXECUTION_TIMEOUT_SECONDS} ${cmd}` wrapped in the shell
- **Fallback:** If `/usr/bin/time` is unavailable, plain `timeout` is used
- **Exit code:** 124 indicates timeout (standard Linux `timeout` exit code)

**Assessment:** Adequate for single-user use. The 30-second timeout prevents runaway processes. The cleanup cron provides a safety net for containers that escape the timeout.

---

## 6. Input Validation

### Path Traversal Protection

```typescript
// contentPaths.ts
function isSafeSegment(segment: string): boolean {
    return (
        !!segment &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('/') &&
        !segment.includes('\\') &&
        !segment.includes('\0')
    );
}
```

Problem slugs are validated to prevent path traversal.

### Dynamic Test Case Evaluation

```typescript
// submit/+server.ts
const evaluated = vm.runInNewContext(expr, {}, { timeout: 2000 });
```

The `@javascript:` prefix in test cases triggers evaluation in a sandboxed V8 context with:
- Empty context object (no globals)
- 2-second timeout

**Assessment:** `vm.runInNewContext` is not fully sandboxed (known V8 escape vectors exist), but since test cases are from the bundled content (not user-supplied), the risk is minimal. Do not allow user-created test cases to use `@javascript:` prefixes.

---

## 7. Docker Images

| Language | Image | Tag | Notes |
|---|---|---|---|
| Python | `python:3.11-slim` | Debian-based | Minimal Python install |
| C++ | `gcc:13` | Debian-based | Full GCC toolchain |
| Java | `alpine/java:22-jdk` | Alpine-based | OpenJDK 22 |
| Go | `golang:1.22-alpine` | Alpine-based | Full Go toolchain |
| Rust | `rust:1.78-slim` | Debian-based | Full Rust toolchain |
| TypeScript | `node:22-alpine` | Alpine-based | Node.js 22 |
| C# | `mcr.microsoft.com/dotnet/sdk:8.0-alpine` | Alpine-based | .NET SDK 8.0 |
| PHP | `php:8.3-cli` | Debian-based | PHP CLI |

### Finding: IMAGES_PULLED_ON_DEMAND

Images are pulled on first use (`ensureImageAvailable()`). For offline use, all required images must be pre-pulled while online. Custom offline-friendly images can be specified via environment variables (`COJUDGE_CPP_IMAGE`, `COJUDGE_GO_IMAGE`, etc.).

---

## 8. Recommendations for DevPrep

### Priority 1 (Before Release)

1. **Add resource limits** to all `createContainer` calls
2. **Disable networking** on runner containers (`NetworkMode: 'none'`)
3. **Document required Docker images** and provide a pre-pull script

### Priority 2 (Hardening)

4. **Drop all capabilities** (`CapDrop: ['ALL']`)
5. **Run as non-root** inside containers
6. **Use read-only root filesystem** with tmpfs mounts

### Priority 3 (Production-Grade)

7. **Consider gVisor/runsc** for additional syscall isolation
8. **Add rate limiting** to run/submit endpoints
9. **Fresh containers per execution** instead of pooling (security vs performance trade-off)

### Acceptable for DevPrep v1.0

The current security posture is acceptable for a single-user, fully offline application. The Docker socket exposure and lack of container hardening are trade-offs that prioritize simplicity and performance. Since the user runs their own code on their own machine, the threat model is primarily about preventing accidental resource exhaustion rather than defending against malicious input.
