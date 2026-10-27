# Full Judge Verification Plan

**Date:** 2026-10-27
**Purpose:** Define the approach for verifying all 250 NeetCode 250 problems across Python, C++, and Java (M2 milestone target: 750/750).

---

## Approach

### Automated Verification Script

Location: `scripts/verify-judge.mjs`

The script tests problems by submitting solutions to the running Cojudge dev server via its HTTP API:

1. **POST `/api/submit`** with `{problemId, language, code, startTcNo: 0}` — starts an async job.
2. **GET `/api/submit?jobId=...`** — polls until `ready: true`.
3. Records verdict: `ACCEPTED`, `REJECTED`, `ERROR`, `TIMEOUT`.

### Test Categories

| Category | Purpose | Count per problem |
|---|---|---|
| Correct solution | Verify judge accepts valid solutions | 3 (one per language) |
| Wrong solution | Verify judge rejects invalid solutions | 3 (one per language) |
| Timeout | Verify timeout detection | 1 (sleep-based) |
| Compile error | Verify compilation error reporting | 2 (C++ and Java) |

### Solution Requirements

Solutions must match **Cojudge's expected signatures**, which differ from LeetCode in several cases:

| Cojudge Convention | LeetCode Convention | Example |
|---|---|---|
| `int[][]` return (Java) | `List<List<Integer>>` | 3sum, subsets |
| `int[][]` grid parameter | `char[][]` grid | number-of-islands |
| Wrapper function `runXxx(ops, args)` | Class-based API | lru-cache, lfu-cache |
| `GraphNode` class | `Node` class | clone-graph |

The verification script must use Cojudge-compatible signatures, derived from `metadata.json` → `starterCode` for each problem.

### Execution Prerequisites

1. Docker Desktop running with daemon accessible.
2. Docker images pre-pulled: `python:3.11-slim`, `gcc:13`, `alpine/java:22-jdk`.
3. Cojudge dev server running: `npm run dev` (at `localhost:5173`).
4. Content seeded: `~/cojudge/` populated on first server access.

### Running the Script

```bash
# Full 20-problem verification (M0.1)
node scripts/verify-judge.mjs

# Single problem
node scripts/verify-judge.mjs --problem two-sum

# Single language
node scripts/verify-judge.mjs --lang python

# Custom output file
node scripts/verify-judge.mjs --csv results.csv
```

---

## M2 Expansion: 750/750 Verification

For the M2 milestone, the script will be extended to:

1. **Auto-generate solutions** by extracting the reference solution from each problem's `Marker.java` (which contains a working Java implementation).
2. **Cross-language solution generation** using the Marker as the source of truth.
3. **Batch execution** with parallel submissions (respecting Docker resource limits).
4. **Coverage report** showing pass/fail per problem per language.

### Estimated Effort

- 250 problems × 3 languages = 750 submissions.
- At ~4-6 seconds per submission = ~50-75 minutes total runtime.
- Failures will need manual investigation and solution fixes.

### Success Criteria

750/750 correct solutions accepted. Any problem that fails must be triaged as:

| Category | Action |
|---|---|
| **Solution bug** | Fix the test solution |
| **Content bug** | Fix `Marker.java`, `official-tests.json`, or `metadata.json` |
| **Runner bug** | Fix the language runner (e.g., type conversion, harness generation) |
| **Harness bug** | Fix the generated test harness code |

---

## Known Cojudge Conventions to Account For

These were discovered during M0.1 verification:

1. **Java uses primitive arrays** (`int[]`, `int[][]`) where LeetCode uses `List<Integer>`, `List<List<Integer>>`.
2. **Grid problems use `int` not `char`** — e.g., `numIslands(int[][] grid)` where `1`/`0` are ints.
3. **Class-based problems are wrapped** in a `Solution.runXxx(operations, args)` function.
4. **Graph problems use `GraphNode`** (not `Node`) with a different constructor.
5. **The submit endpoint processes tests in batches** — non-large tests are grouped, large tests (`_isLargeTest: true`) run individually.
6. **The Marker.java validation** runs in a separate Java container for non-Java languages.
