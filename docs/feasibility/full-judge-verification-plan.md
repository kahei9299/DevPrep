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

### M1 Preparation (Complete)

The verification framework has been extended to support M2:

1. **Fixture-based solutions**: `tests/judge/fixtures/{slug}/solution.{py,cpp,java}` — 20 problems extracted from M0.1, remaining 230 to be added.
2. **Fixture loading**: `verify-judge.mjs --fixtures-dir tests/judge/fixtures` loads solutions from files instead of inline constants.
3. **JSON output**: `verify-judge.mjs --output results.json` writes structured results for programmatic consumption.
4. **Resume mode**: `verify-judge.mjs --resume --output results.json` skips already-passed tests, allowing interrupted M2 runs to continue.
5. **Solution inventory**: `docs/feasibility/solution-inventory.json` tracks 250 problems × 3 languages with availability status.
6. **Verification manifest**: `docs/feasibility/verification-manifest.json` tracks verification status per combination.
7. **Inventory script**: `scripts/inventory-solutions.mjs` regenerates the inventory and manifest.

### Remaining M2 Work

For the M2 milestone:

1. **Write reference solutions** for the 230 problems not covered by M0.1 (Python, C++, Java).
2. **Java solutions from Marker.java**: Each problem's `Marker.java` contains a working Java reference. These need adaptation to match `starterCode` signatures.
3. **Batch execution** with the fixture loader (respecting Docker resource limits).
4. **Coverage report** from the verification manifest.

### Estimated Effort

- 250 problems × 3 languages = 750 submissions.
- At ~4-6 seconds per submission = ~50-75 minutes total runtime.
- 60/750 already verified in M0.1.
- 230 Java solutions extractable from Marker.java (need adaptation).
- 230 Python and 230 C++ solutions need writing.
- Failures will need manual investigation and solution fixes.

### Success Criteria

750/750 correct solutions accepted. Any problem that fails must be triaged as:

| Category | Action |
|---|---|
| **Solution bug** | Fix the test solution |
| **Content bug** | Fix `Marker.java`, `official-tests.json`, or `metadata.json` |
| **Runner bug** | Fix the language runner (e.g., type conversion, harness generation) |
| **Harness bug** | Fix the generated test harness code |

### Verification Levels

Each language-problem combination is assessed at multiple levels:

| Level | Description |
|---|---|
| `correct_accepted` | Reference solution accepted by submit endpoint |
| `public_tests_passed` | Sample tests pass via run endpoint |
| `hidden_tests_passed` | Full official tests pass via submit endpoint |
| `wrong_rejected` | Deliberately incorrect solution rejected |
| `edge_cases_validated` | Boundary conditions tested |
| `special_judge_validated` | Custom validator behavior confirmed |

---

## Known Cojudge Conventions to Account For

These were discovered during M0.1 verification:

1. **Java uses primitive arrays** (`int[]`, `int[][]`) where LeetCode uses `List<Integer>`, `List<List<Integer>>`.
2. **Grid problems use `int` not `char`** — e.g., `numIslands(int[][] grid)` where `1`/`0` are ints.
3. **Class-based problems are wrapped** in a `Solution.runXxx(operations, args)` function.
4. **Graph problems use `GraphNode`** (not `Node`) with a different constructor.
5. **The submit endpoint processes tests in batches** — non-large tests are grouped, large tests (`_isLargeTest: true`) run individually.
6. **The Marker.java validation** runs in a separate Java container for non-Java languages.
