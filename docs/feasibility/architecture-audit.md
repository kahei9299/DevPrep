# Cojudge Architecture Audit

**Date:** 2026-10-27
**Version audited:** 0.8.8 (commit from cloned main branch)
**Repository:** https://github.com/cojudge/cojudge

---

## 1. Frontend Framework and Routing

| Aspect | Detail |
|---|---|
| Framework | SvelteKit 2.x (Svelte 5) with Vite 7 |
| Adapter | `@sveltejs/adapter-node` (SSR, produces a `build/` folder run with `node build`) |
| Editor | Monaco Editor 0.54 with optional Vim mode (`monaco-vim`) |
| Styling | Plain CSS with CSS variables for light/dark theming |
| State management | Svelte stores (`$lib/stores/`) backed by browser `localStorage` |

### Routes

| Route | Purpose |
|---|---|
| `/` (`+page.svelte`) | Homepage with course listing, progress tracker, problem table |
| `/problems/[slug]` | Problem view with statement, editor, test runner, debugger |
| `/p/[id]` | Short URL redirect (alias for `/problems/[slug]`) |
| `/playground` | Free-form code playground (run arbitrary code without a problem context) |
| `/whiteboard` | Drawing whiteboard for interview prep |
| `/recovery` | LocalStorage recovery/export tool |

### API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/run` | POST/GET | Execute code against sample test cases (async job model) |
| `/api/submit` | POST/GET | Execute code against hidden tests (async job model) |
| `/api/debug` | POST | Start an interactive debug session |
| `/api/playground/run` | POST | Run playground code |
| `/api/image/pull` | POST | Pull Docker images for language runtimes |
| `/api/image/status` | GET | Check Docker image availability |
| `/api/course-statements` | GET | Fetch rendered problem statements for a course |
| `/api/export` | POST | Export user data |
| `/api/export-file` | POST | Export a specific file |
| `/api/reveal-file` | POST | Reveal a file in the OS file manager |
| `/api/content/modified` | GET | List user-modified content |
| `/api/content/reset` | POST | Reset modified content to bundled version |
| `/api/problems/[slug]/asset/[...path]` | GET | Serve problem assets (images) |

---

## 2. Backend and API Implementation

- **Runtime:** Node.js 20+ (SvelteKit runs server-side via `adapter-node`)
- **Process model:** Single-process Node.js server; async jobs stored in in-memory `Map` objects (no database, no queue)
- **Job lifecycle:** POST creates a job ID, starts execution asynchronously; GET polls by job ID until `ready: true`
- **Content resolution:** Two-tier system — user content in `~/cojudge/` (or `$COJUDGE_CONTENT_DIR`) takes precedence over repo-bundled `problems/` and `courses/` directories
- **Content seeding:** On first access, bundled content is copied to `~/cojudge/` with a SHA-256 manifest (`.cojudge-seed.json`) tracking pristine vs user-modified files
- **Cloud sync:** Optional Firebase/Firestore integration for cloud backup (requires Google sign-in; local storage remains source of truth)

---

## 3. Code Execution and Docker Sandboxing

### Execution Flow

1. Client POSTs code + test cases to `/api/run` or `/api/submit`
2. Server reads problem metadata (`metadata.json`) and generates a language-specific test harness
3. A Docker container is acquired from the `ContainerPool` (or created fresh)
4. Source files are packed as a tar archive and uploaded to the container at `/app`
5. Code is compiled (C++/Java/Rust/C#/Go) or prepared (Python/TypeScript/PHP)
6. The program is executed with a 30-second timeout via `timeout` command
7. Output is parsed: results are `---`-delimited chunks, each containing `:::RESULT:::` and optionally `:::ERROR:::` markers
8. For Java with `Marker.java`, verdicts are embedded in output (`:::VERDICT:::`, `:::ANSWER:::`)
9. For non-Java languages, a separate Marker container runs the Java `Marker.java` to validate outputs
10. Results are returned with `isCorrect`, `correctAnswer`, execution time, and memory metrics

### Container Pool

- Maintains up to 2 idle containers per image
- Containers are reused across runs (cleaned between uses by deleting `/app` artifacts)
- Stale containers are cleaned up by a 60-second cron job
- Containers labeled with `cojudge.created=true` and session ID for cleanup tracking
- On server shutdown, all session containers are force-removed

### Marker System (Validation)

The `Marker.java` file is the canonical validator for every problem. It contains:
- A reference solution method (e.g., `twoSum(...)`)
- An `isCorrect(inputs..., output)` method for custom validation

For Java runs, the marker is compiled alongside user code for merged execution. For all other languages, user output is fed to a separate Java container that runs the marker.

---

## 4. Language Runner Implementations

| Language | Runner Class | Docker Image | Compile Step | Run Command |
|---|---|---|---|---|
| Python 3 | `PythonRunner` | `python:3.11-slim` | None (uploads files) | `python -B -u main.py` |
| C++17 | `CppRunner` | `gcc:13` | `g++ -std=c++17 -O2 -pipe -g -rdynamic -o main Main.cpp` | `./main` |
| Java | `JavaRunner` | `alpine/java:22-jdk` | `javac *.java` | `java Main` |
| TypeScript | `TypeScriptRunner` | `node:22-alpine` | Transpiles via built-in Node.js | `node main.js` |
| Rust | `RustRunner` | `rust:1.78-slim` | `rustc` compilation | `./main` |
| Go | `GoRunner` | `golang:1.22-alpine` | `go build` | `./main` |
| C# | `CSharpRunner` | `mcr.microsoft.com/dotnet/sdk:8.0-alpine` | `dotnet build` | `dotnet run` |
| PHP | `PhpRunner` | `php:8.3-cli` | None | `php main.php` |

### Supported Types

Each language util (`pythonUtil.ts`, `cppUtil.ts`, `javaUtil.ts`, etc.) implements serialization/deserialization for:
- Primitive types: `int`, `long`, `double`, `boolean`, `string`, `char`
- Array types: `int_array`, `string_array`, `double_array`, `char_array`
- 2D arrays: `int_2d_array`, `string_2d_array`, `char_2d_array`
- Data structures: `ListNode` (linked list), `TreeNode` (binary tree), `GraphNode`
- Class-based problems with operation sequences (e.g., LRU Cache)
- Interactive problems (guess-word, binary search judge)

### Debug Support

All 8 languages have debug drivers (`DebugRunner.ts`, `*DebugDriver.ts`) that provide:
- Breakpoint setting
- Step-through execution
- Variable inspection
- Interactive debug sessions via polling

---

## 5. Problem Metadata and Test Case Schemas

### Problem Directory Structure

```
problems/<slug>/
  metadata.json       # Problem definition, starter code, function signature
  statement.md        # Problem description (markdown)
  official-tests.json # Hidden test cases (array of test objects)
  Marker.java         # Reference solution + isCorrect validator
  solution.md         # Optional solution walkthrough
  assets/             # Optional images referenced in statement.md
```

### metadata.json Schema

```json
{
  "id": "two-sum",
  "title": "1. Two Sum",
  "difficulty": "Easy|Medium|Hard",
  "link": "https://leetcode.com/problems/two-sum/",
  "category": "array",
  "examples": [{"input": "...", "output": "...", "explanation": "..."}],
  "starterCode": {
    "java": "...", "python": "...", "cpp": "...",
    "csharp": "...", "rust": "...", "go": "...",
    "typescript": "...", "php": "..."
  },
  "testCases": [{"nums": "[2,7,11,15]", "target": 9}],
  "functionName": "twoSum",
  "params": [{"name": "nums", "type": "int_array"}, {"name": "target", "type": "int"}],
  "outputType": "int_array",
  "hints": ["..."],
  "classProblem": {"userClassName": "MedianFinder"},
  "interactive": {"kind": "guess-word", "secretField": "secret"},
  "checkGraphClone": true
}
```

### official-tests.json Schema

Array of test case objects matching the `params` definition. Special fields:
- `_isLargeTest`: boolean — marks tests that should be run individually (not batched)
- `@javascript:` prefix — dynamically evaluated at runtime (e.g., large array generation)

### Course Registration (courseinfo.json)

```json
{
  "title": "NeetCode 250",
  "description": "...",
  "category-order": ["arrays-hashing", "two-pointers", ...],
  "problems-of-category": {
    "arrays-hashing": ["two-sum", "contains-duplicate", ...]
  }
}
```

---

## 6. Local Storage and Persistence

| Data | Storage | Location |
|---|---|---|
| User code (per problem, per language) | Browser localStorage | Key: `cojudge-code-store` |
| Progress (solved problems) | Browser localStorage | Key: `cojudge-user-store` |
| User settings (theme, editor prefs) | Browser localStorage | Key: `cojudge-user-settings` |
| Game mode results | Browser localStorage | Key: `cojudge-game-results` |
| Tab/file organization | Browser localStorage | Key: `cojudge-file-store` |
| Problem content | Filesystem | `~/cojudge/problems/` and `~/cojudge/courses/` |
| Cloud backup | Firebase Firestore | Optional, requires Google sign-in |

**Critical note:** All user progress and code is stored exclusively in browser localStorage. There is no server-side database. Data does not survive browser data clearing unless cloud sync is enabled. The `persistLimits.ts` module implements a cap-based approach to manage localStorage size limits (tracking which items to evict when space is low).

---

## 7. Problem/Course Registration

- **Courses** are defined in `courses/<id>/courseinfo.json`
- **Available courses:** `basic50`, `blind75`, `nc150`, `nc250`, `leetcode-1000`
- Problems are referenced by slug in `problems-of-category` sections
- A problem can appear in multiple courses
- Adding a new course requires only a new `courseinfo.json` file
- Problems are auto-discovered: the `courseCatalog.ts` module reads all course directories and builds a unified catalog
- The `contentPaths.ts` module handles the two-tier content resolution (user copy > bundled copy)

---

## 8. Existing Automated Tests

### Unit Tests (Vitest)

- **23 test files**, **231 tests** — all passing
- Coverage areas:
  - Utility functions: `javaUtil`, `cppUtil`, `goUtil`, `csharpUtil`, `phpUtil`
  - Markdown rendering
  - Vim mode configuration
  - Container pool lifecycle
  - Content path resolution and course catalog
  - Cloud sync policy, file change detection, cloud assets
  - Progress validation and backup
  - Cross-tab sync, dialog management
  - App update logic, debug source mapping
  - Firebase settings, persist limits

### E2E Tests (Playwright)

- **13 test files** covering:
  - Basic end-to-end flow (`basic-e2e.test.ts`)
  - Cloud sync functionality
  - Course tab loading
  - LeetCode 1000 numbering
  - Duplicate example detection
  - Playground features (debugger, folders, inline code, markdown, tabs)
  - Tab context menu
  - Whiteboard connections

### Missing Test Coverage

- No automated judge correctness tests (no test that actually runs code through Docker)
- No integration tests for the run/submit API endpoints
- No tests for Marker.java validation correctness
- No multi-language execution tests

---

## 9. Docker Deployment Approach

### Development Mode
```bash
npm install && npm run dev  # Starts Vite dev server at localhost:5173
```

### Production (CLI)
```bash
./install.sh  # Builds and creates `cojudge` alias
cojudge       # Starts Node.js server at localhost:5375
```

### Production (Docker)
```bash
./docker.sh   # Builds image and runs container
```

- Multi-stage Dockerfile: deps → build → runtime (Node.js 20 Alpine)
- Host Docker socket is bind-mounted into the container (`-v /var/run/docker.sock:/var/run/docker.sock`)
- Application spawns "sibling containers" via Dockerode for code execution
- Container is mapped to port 5375 by default
- `--restart=unless-stopped` for automatic restart

### Desktop App (Tauri)
- Native macOS/Windows/Linux app using Tauri 2.x
- Bundles Node.js backend, problems, and courses
- Docker still required for code execution

---

## 10. Security Considerations

### Critical: Docker Socket Access

The host Docker socket (`/var/run/docker.sock`) is mounted into:
1. The main application container (when using `docker.sh`)
2. Accessible to the Node.js process (when running locally)

**Risk:** Full Docker API access means any code path that interacts with Docker could potentially:
- Create containers with host filesystem mounts
- Access the Docker API to manage any container on the host
- Escalate to host-level root access via Docker

### Container Security Gaps

Runner containers are created with **no security hardening**:

| Security Control | Status |
|---|---|
| Memory limits | **Not set** |
| CPU limits | **Not set** |
| Network isolation (`NetworkMode: none`) | **Not set** — containers have full network access |
| Read-only filesystem | **Not set** |
| Capability dropping (`CapDrop`) | **Not set** |
| PID limits | **Not set** |
| Seccomp profile | **Not set** |
| User namespace | **Not set** — runs as root inside containers |

### Execution Timeout

- 30-second timeout via Linux `timeout` command (`EXECUTION_TIMEOUT_SECONDS = '30'`)
- Cleanup cron runs every 60 seconds, removes containers older than 40 seconds (timeout + 10s buffer)
- `RunnerCrashError` class handles partial output from crashed containers

### Input Handling

- `vm.runInNewContext()` is used in `submit/+server.ts` to evaluate `@javascript:` prefixed test case values — this runs in a sandboxed V8 context with a 2-second timeout
- Problem slugs are validated via `isSafeSegment()` (no path traversal)
- Content paths use two-tier resolution with safe path joining

### Cloud Sync

- Firebase authentication with Google sign-in
- Firestore security rules exist (`firestore.rules` — 26.5KB)
- Local storage remains source of truth; cloud is backup only

### Recommendations for DevPrep

1. **Add container resource limits**: Memory (256MB), CPU (0.5 cores), PID limits
2. **Disable networking**: Set `NetworkMode: 'none'` on runner containers
3. **Drop capabilities**: Add `CapDrop: ['ALL']`
4. **Read-only root filesystem**: Set `ReadonlyRootfs: true` with `/app` as tmpfs
5. **Non-root user**: Run code as non-root inside containers
6. **Consider gVisor/runsc**: For additional syscall isolation
7. **Rate limiting**: No rate limiting on run/submit endpoints
