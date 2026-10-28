# Marker Compilation Cache Design

**Date:** 2026-10-28
**Branch:** `perf/marker-compilation-cache`

---

## Chosen Approach: Option A — Host-side Compilation Cache

Cache compiled `.class` files for the constant parts of each Marker invocation (helper classes + `Marker.java`). On cache hit, upload pre-compiled classes alongside the per-request `Main.java` and compile only that single file.

### How it works

1. **Hash inputs.** Compute SHA-256 of the concatenation of: `Marker.java` source, `ListNode.java`, `TreeNode.java`, `GraphNode.java`, and `javaHelperMethods` (the helper code embedded in `Main.java`). These are every input to `javac` that is constant across requests for the same problem.

2. **Check cache.** Look for `node_modules/.cache/marker-cache/<hash>/` containing `.class` files.

3. **Cache hit path:**
   - Upload `Main.java` + all cached `.class` files to the container via tar.
   - Compile only `Main.java`: `javac -cp . Main.java`.
   - Run `java Main`.
   - Expected compile time: tens of milliseconds (one file, dependencies already resolved).

4. **Cache miss path:**
   - Upload all 5 `.java` files (unchanged from current behaviour).
   - Compile with `javac *.java` (unchanged).
   - After successful compilation, extract `.class` files from the container via `container.getArchive('/app')`.
   - Store all `.class` files **except `Main.class`** in the cache directory.
   - Run `java Main`.

5. **Cache invalidation.** Automatic — any change to `Marker.java`, the helper classes, or `javaHelperMethods` produces a different SHA-256 hash and a new cache entry. Old entries can be evicted by age or count.

### Cache location

`node_modules/.cache/marker-cache/<sha256-hex>/`

- `node_modules/.cache/` is a conventional cache location (used by Babel, ESLint, Vite, etc.).
- Already gitignored via `node_modules/` in `.gitignore`.
- Survives `npm install` (npm preserves `node_modules/.cache/`).
- Destroyed by `rm -rf node_modules` — acceptable; the cache is rebuilt transparently on next use.

### What is cached

| Artifact | Cached? | Reason |
|---|---|---|
| `Marker.class` (+ inner classes) | Yes | Constant per problem version |
| `ListNode.class` | Yes | Constant globally |
| `TreeNode.class` | Yes | Constant globally |
| `GraphNode.class` | Yes | Constant globally |
| Helper method classes | Yes | From `javaHelperMethods`, constant globally |
| `Main.class` | **No** | Changes every request (test inputs + user outputs) |
| `Main.java` | **No** | Generated per request |
| `Marker.java` source | **No** | Read from filesystem; hash is the key |

### Concurrent access

- Multiple requests for the same problem arrive simultaneously.
- First request to start a cache-miss compilation proceeds normally.
- The cache write is atomic: compile into a temp directory, then `rename()` to the final path. Concurrent readers either see the complete directory or nothing (miss).
- A concurrent miss for the same key results in redundant compilation — acceptable for correctness; the second write overwrites with an identical result.

### Error handling

| Scenario | Behaviour |
|---|---|
| Cache-hit compilation fails (`javac Main.java` error) | Evict cache entry, retry with full compilation (cache miss path). If retry also fails, propagate the error. |
| Cache-miss compilation fails (`javac *.java` error) | Do not cache. Propagate the error (unchanged behaviour). |
| Corrupted/incomplete cache directory | `javac Main.java` fails → triggers eviction and full retry. |
| `getArchive` extraction fails | Log warning, do not cache. The current request still succeeds (classes are in the container). Future requests retry caching. |
| Container destroyed mid-extraction | No cache entry written. Next request uses cache-miss path. |

---

## Alternatives Considered

### Option B — Warm Marker Containers

Keep Marker containers alive between requests with pre-compiled `.class` files already on disk.

**Problem:** `ContainerPool.cleanContainer()` runs `rm -f /app/*.class` on every acquire. Changing this would couple pool cleanup to Marker-specific knowledge and risk cross-contamination between different problems reusing the same container. The pool is shared between user-code runners and Marker runners.

**Verdict:** Higher risk than host-side caching. Would require ContainerPool changes that affect all runners.

### Option C — Persistent JVM Worker

Run a long-lived Java process that accepts validation requests without restarting the JVM.

**Benefits:** Eliminates JVM startup (~300ms per invocation) in addition to compilation.

**Problems:**
- Requires designing a protocol (stdin/stdout, socket, or HTTP) for passing test inputs and receiving results.
- The worker must handle failure, timeout, and restart without corrupting state.
- Resource consumption: a persistent JVM uses ~100-200MB of memory.
- Security: a long-lived process accumulates state; harder to reason about isolation.

**Verdict:** Not justified when compilation (85% of overhead) can be cached with a simpler approach. The remaining ~300ms JVM startup is acceptable.

### Option D — Embed Java in Python/C++ Images

Add a JRE to `python:3.11-slim` and `gcc:13` so Marker validation runs inside the user's container.

**Benefits:** Eliminates the second container lifecycle entirely.

**Problems:**
- Increases image size substantially (JRE is ~200MB).
- Changes the Docker security boundary — user code and Marker code run in the same container.
- Maintenance burden: custom images for each language.
- Requires ADR approval.

**Verdict:** Not acceptable without architectural review.

---

## Correctness and Isolation Guarantees

The 13 requirements from the task specification and how this design satisfies each:

| # | Requirement | How satisfied |
|---|---|---|
| 1 | User code must never become a cached validator artifact | Only `Marker.java` and helper classes are cached. User code is never present in the Marker container — it runs in a separate container. |
| 2 | User code/output must not alter cached artifacts | Cache is populated from a container that only contains trusted Marker sources. User outputs are only in `Main.java`, which is never cached. |
| 3 | Distinct problem versions must not share incompatible artifacts | Cache key is a SHA-256 of all compiled sources. A Marker change produces a different hash. |
| 4 | Cache keys must include every input affecting compilation | Hash covers: Marker.java, ListNode.java, TreeNode.java, GraphNode.java, javaHelperMethods. These are every file passed to `javac` except Main.java (which is per-request). |
| 5 | Concurrent requests must not cause partial/corrupted entries | Cache writes use atomic rename (temp dir → final path). Readers see complete entries or nothing. |
| 6 | Incomplete compilation must not be cached | Cache is populated only after `javac` succeeds (exit code 0). Failed compilations skip caching. |
| 7 | Corrupted/missing cache must trigger safe rebuilds | If `javac Main.java` fails on a cache hit, the entry is evicted and a full recompilation is attempted. |
| 8 | Cache eviction must not invalidate active executions | Eviction deletes the host-side directory. Active executions already have classes inside their container — the host cache is not referenced after upload. |
| 9 | Cached artifacts must remain within Docker trust boundary | Classes are compiled inside a Docker container with standard security controls. The host stores only the resulting `.class` bytecode. These files are uploaded back into Docker containers for execution. |
| 10 | All executions must remain fully offline | No network access required. Cache is local filesystem. |
| 11 | Docker security restrictions must remain enforced | No changes to `cojudgeHostConfig()`. Containers retain: 512MB memory, 1 CPU, 256 PIDs, NetworkMode: none, CapDrop: ALL, no-new-privileges. |
| 12 | Cache misses must preserve uncached semantics | The miss path is identical to the current implementation: upload all sources, `javac *.java`, `java Main`. |
| 13 | Results from one submission must never leak into another | Each request generates a fresh `Main.java` with its own inputs/outputs. Cached `.class` files contain only the deterministic compilation of trusted source files. Container is cleaned between uses. |

---

## Expected Performance Impact

| Scenario | Current | With cache |
|---|---|---|
| Marker compile (cache miss) | 2.7–3.3s | 2.7–3.3s (unchanged — full compilation, plus extraction overhead) |
| Marker compile (cache hit) | 2.7–3.3s | **~50–200ms** (compile one file against existing classpath) |
| JVM run | 290–390ms | 290–390ms (unchanged) |
| Total Marker (cache hit) | 3.2–3.7s | **~0.4–0.7s** |
| Python Run total (cache hit) | 3.3–3.6s | **~0.5–1.0s** |

Target: ≥30% reduction in median warm Python/C++ Run latency. Expected: ~70-80% reduction in Marker overhead, ~60-75% reduction in total Python Run latency.
