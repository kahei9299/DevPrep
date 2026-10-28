# Marker Compilation Cache Design

**Date:** 2026-10-28
**Branch:** `perf/marker-compilation-cache`
**Implementation version:** HARNESS_VERSION = 2

---

## Chosen Approach: Data-Driven Harness with Host-Side Class Cache

Cache **all** compiled `.class` files — including `Main.class` — so that cache hits require **zero `javac` invocations**. This works because the generated `Main.java` reads test data from a binary file at runtime, making the compiled `Main.class` reusable across requests for the same problem.

### How it works

1. **Generate a data-driven harness.** `Main.java` reads test inputs and user outputs from `/app/data.bin` using a length-prefixed (netstring) protocol, instead of embedding them as Java source literals. The harness depends only on the problem's function signature — not on specific test data.

2. **Hash all compilation inputs.** SHA-256 of: `Marker.java` source, `ListNode.java`, `TreeNode.java`, `GraphNode.java`, `javaHelperMethods`, and the harness signature (function name, param types, output type, interactive config, and `HARNESS_VERSION`).

3. **Check cache.** Look for `node_modules/.cache/marker-cache/<hash>/` containing `.class` files. Validate that `Main.class` and `Marker.class` are present and non-empty.

4. **Cache hit path (no `javac`):**
   - Upload cached `.class` files + `data.bin` to the container via tar.
   - Run `java Main` directly.
   - No compilation step.

5. **Cache miss path:**
   - Upload all `.java` sources + `data.bin`.
   - Compile with `javac *.java`.
   - After successful compilation, extract all `.class` files from the container via `container.getArchive('/app')`.
   - Store in cache directory atomically (write to temp dir, rename).
   - Run `java Main`.

6. **Cache invalidation.** Automatic via content hash. Any change to `Marker.java`, helper classes, `javaHelperMethods`, function signature, or `HARNESS_VERSION` produces a different hash. Old entries are never reused.

### Data transport protocol

Test data is encoded using **netstrings** (length-prefixed UTF-8 fields):

```
<byte-length>:<utf8-bytes>
```

Example for `two-sum` with inputs `[2,7,11,15]`, `9` and user output `[0,1]`:
```
1:15:[2,7,11,15]1:91:95:[0,1]
```

This format:
- Preserves embedded newlines, carriage returns, tabs, quotes, and trailing spaces exactly.
- Distinguishes empty strings from absent fields.
- Is unambiguous — no escaping or delimiter conflicts.
- Rejects truncated or malformed data explicitly (the Java parser throws `RuntimeException` with offset details).
- Handles arrays, nested arrays, tree/list/graph inputs, and multi-line strings.

The Java parser in Main.java reads a byte-length prefix, then that many bytes of UTF-8 content. The TypeScript encoder in `markerHarness.ts` uses `Buffer.from(value, 'utf-8')` for exact byte-length computation.

### Cache key composition

The cache key is SHA-256 of three inputs:

| Input | Included? | Rationale |
|---|---|---|
| `Marker.java` source | Yes | Defines `isCorrect()` and reference solution |
| **Generated `Main.java` source** | Yes | Covers function name, param types, output type, interactive config, `javaHelperMethods`, helper class sources, and the harness code structure. Any change to the harness generator automatically produces a different hash — no manual version bump needed. |
| Docker image tag (e.g. `alpine/java:22-jdk`) | Yes | Invalidates if the Java compiler/runtime version changes |
| Test data / user outputs | No | Read at runtime from `data.bin`, never compiled |

The generated `Main.java` source is the single authoritative representation of all compilation inputs besides `Marker.java` and the JDK. It includes `javaHelperMethods` (which contains `ListNode`, `TreeNode`, `GraphNode` class definitions and all `to_*`/`display_*` conversion functions) verbatim, so changes to any helper class or conversion function automatically invalidate the cache.

`HARNESS_VERSION` is retained in the harness signature for documentation purposes but is not the sole invalidation mechanism — the full `Main.java` source hash provides automatic invalidation.

### Cache location

`node_modules/.cache/marker-cache/<sha256-hex-16>/`

- Conventional location (used by Babel, ESLint, Vite).
- Gitignored via `node_modules/`.
- Survives `npm install`.
- Destroyed by `rm -rf node_modules` — acceptable; rebuilds transparently.
- Maximum size: ~25MB (250 problems × ~100KB per entry).
- No automatic eviction by age or size. Manual cleanup: `rm -rf node_modules/.cache/marker-cache`.

### What is cached

| Artifact | Cached? | Reason |
|---|---|---|
| `Main.class` | **Yes** | Data-driven; reads inputs at runtime |
| `Marker.class` (+ inner classes) | Yes | Constant per problem version |
| `ListNode.class`, `TreeNode.class`, `GraphNode.class` | Yes | Constant globally |
| Helper method classes from `javaHelperMethods` | Yes | Constant globally |
| `data.bin` | **No** | Changes every request |
| `.java` sources | **No** | Only needed for compilation |

### Concurrent access

- First request for a cache-miss key starts compilation. A `pending` promise map deduplicates — concurrent requests for the same key await the first compilation's result.
- Cache write is atomic: compile to temp directory, `rename()` to final path. Concurrent readers see the complete directory or nothing.
- Cache eviction deletes the host-side directory. Active executions already have classes inside their container.
- If `rename()` fails (another process wrote first), the temp directory is cleaned up and the winner's entry is used.

### Cache integrity

| Check | When | Behaviour |
|---|---|---|
| Required classes present | Cache read | `Main.class` and `Marker.class` must be present and non-empty |
| Compilation succeeded | Cache write | Only store after `javac` exit code 0 |
| Extraction complete | Cache write | Validate required classes before writing to disk |
| Runtime error on cache hit | Execution | Evict entry, fall back to legacy inline harness |
| Truncated data.bin | Runtime (Java) | `RuntimeException` with "Truncated data at offset N" |
| Malformed data.bin | Runtime (Java) | `RuntimeException` with "Malformed length at offset N" |

### Error handling and fallback

| Scenario | Behaviour |
|---|---|
| Cache hit, `java Main` fails | Evict cache entry, retry with legacy inline harness (original Cojudge approach). If retry also fails, propagate error. |
| Cache miss, `javac` fails | Do not cache. Propagate error. |
| Incomplete cache entry | Rejected by `getCachedClasses()` validation. Treated as cache miss. |
| `getArchive` extraction fails | Log warning, do not cache. Current request still succeeds (classes are in container). |
| Container destroyed mid-extraction | No entry written. Next request uses miss path. |

### Security

- Cached `.class` files are compiled inside Docker containers with full security controls (`NetworkMode: 'none'`, `CapDrop: ['ALL']`, etc.).
- Only trusted Marker source code is compiled. User-submitted code runs in separate containers and never touches the Marker cache.
- `data.bin` contains user outputs (untrusted), but these are read by the pre-compiled `Main.class` as data, not compiled or executed as code.
- Host-side cached files are written by the Node.js server process, not by Docker containers. Container code cannot modify the host cache.

---

## Alternatives Considered

### Option B — Warm Marker Containers

Keep containers alive with pre-compiled classes on disk.

**Rejected:** `ContainerPool.cleanContainer()` deletes `*.class` on acquire. Changing this would couple pool cleanup to Marker-specific knowledge and risk cross-contamination. The pool is shared between user-code runners and Marker runners.

### Option C — Persistent JVM Worker

Long-lived Java process accepting validation requests.

**Rejected:** Eliminates ~300ms JVM startup but requires protocol design, failure/timeout handling, restart logic, and persistent memory (~100-200MB). Not justified when compilation (85% of overhead) is already eliminated by caching.

### Option D — Embed Java in Python/C++ Images

Add JRE to language-specific images.

**Rejected:** Changes Docker security boundary. Requires ADR approval.

---

## Correctness Requirements

| # | Requirement | How satisfied |
|---|---|---|
| 1 | User code never cached | Only Marker + helper sources compiled. User code runs in separate containers. |
| 2 | User output cannot alter cache | `data.bin` is read-only data, never compiled. Cache populated from trusted sources only. |
| 3 | Distinct versions don't share artifacts | SHA-256 content hash includes all compilation inputs + `HARNESS_VERSION`. |
| 4 | Key covers all compilation inputs | Hash includes: Marker.java source, generated Main.java source (which embeds helpers, function signature, version), and Docker image tag. |
| 5 | Concurrent misses don't corrupt | Pending-promise deduplication + atomic rename. |
| 6 | Failed compilation not cached | Store only after `javac` exit code 0 + required-class validation. |
| 7 | Corrupted cache triggers rebuild | Incomplete entries rejected on read. Runtime errors trigger eviction + fallback. |
| 8 | Eviction safe during execution | Active containers have their own copy. Host deletion doesn't affect them. |
| 9 | Artifacts within Docker trust boundary | Compiled inside Docker with standard controls. Uploaded back into Docker for execution. |
| 10 | Fully offline | No network access. Cache is local filesystem. |
| 11 | Docker security unchanged | No changes to `cojudgeHostConfig()`. |
| 12 | Miss path preserves uncached semantics | Miss path is identical to original + extraction. |
| 13 | No cross-submission result leakage | Each request generates fresh `data.bin`. Cached `.class` files are deterministic from trusted sources. |
