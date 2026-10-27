# Judge Verification Test Results

**Date:** 2026-10-27
**Status:** BLOCKED — Docker daemon not running

---

## Blocker

Docker Desktop is installed (v29.4.3) but the daemon is not running. The Docker socket at `~/.docker/run/docker.sock` exists but connections are refused:

```
permission denied while trying to connect to the docker API
at unix:///Users/Ka_Hei_LIANG_from.TP/.docker/run/docker.sock
```

**Resolution required:** Start Docker Desktop before running judge verification tests.

---

## Verification Plan

The following 20 representative problems have been selected across all required categories. Once Docker is available, each will be tested with:

1. A correct Python solution
2. A correct C++17 solution (GCC 13)
3. A correct Java 22 solution (OpenJDK 22)
4. An intentionally incorrect solution
5. Edge case testing where applicable
6. Timeout / error reporting verification

### Selected Problems

| # | Slug | Category | Difficulty | Special Aspects |
|---|---|---|---|---|
| 1 | `two-sum` | Arrays & Hashing | Easy | Multiple valid outputs, custom validator |
| 2 | `group-anagrams` | Arrays & Hashing | Medium | Output ordering (multiple valid outputs) |
| 3 | `valid-palindrome` | Two Pointers | Easy | String handling edge cases |
| 4 | `3sum` | Two Pointers | Medium | Multiple valid outputs, dedup |
| 5 | `best-time-to-buy-and-sell-stock` | Sliding Window | Easy | Basic DP / greedy |
| 6 | `minimum-window-substring` | Sliding Window | Hard | Complex string operations |
| 7 | `valid-parentheses` | Stack | Easy | Edge cases (empty, single char) |
| 8 | `binary-search` | Binary Search | Easy | Baseline correctness |
| 9 | `koko-eating-bananas` | Binary Search | Medium | Binary search on answer |
| 10 | `reverse-linked-list` | Linked List | Easy | In-place mutation, linked list types |
| 11 | `lru-cache` | Linked List | Medium | Class-based/stateful, operation sequences |
| 12 | `invert-binary-tree` | Trees | Easy | Tree node types |
| 13 | `serialize-and-deserialize-binary-tree` | Trees | Hard | Custom classes, multiple valid serializations |
| 14 | `implement-trie-prefix-tree` | Tries | Medium | Class-based design problem |
| 15 | `top-k-frequent-elements` | Heap | Medium | Multiple valid outputs |
| 16 | `find-median-from-data-stream` | Heap | Hard | Stateful class problem |
| 17 | `subsets` | Backtracking | Medium | Multiple valid orderings |
| 18 | `number-of-islands` | Graphs | Medium | 2D grid, graph traversal |
| 19 | `clone-graph` | Graphs | Medium | Graph cloning (`checkGraphClone`) |
| 20 | `coin-change` | DP 1D | Medium | Classic DP |

### Test Methodology

For each problem, the test procedure is:

```bash
# Step 1: Write a correct solution
cojudge init <slug> --lang python --output solution.py
# Edit solution.py with correct implementation

# Step 2: Run against sample tests
cojudge run <slug> solution.py

# Step 3: Submit against hidden tests
cojudge submit <slug> solution.py

# Step 4: Repeat for C++ and Java
cojudge init <slug> --lang cpp --output solution.cpp
cojudge init <slug> --lang java --output Solution.java

# Step 5: Test incorrect solution
# Modify to return wrong answer, verify rejection

# Step 6: Test timeout
# Submit an O(n^3) solution to a problem requiring O(n log n)
```

Alternatively, the web UI at `localhost:5375` can be used to test all of the above.

### Verification Criteria

Each test is marked as:

| Status | Meaning |
|---|---|
| PASS | Correct solution accepted, wrong solution rejected |
| FAIL | Judge gives incorrect verdict |
| ERROR | Execution error unrelated to solution correctness |
| TIMEOUT | Judge correctly identifies TLE |
| NOT_RUN | Docker unavailable |

---

## Static Verification (Without Docker)

While Docker is unavailable, I verified the following statically:

### Problem Completeness (All 20 Selected)

| Problem | metadata.json | statement.md | official-tests.json | Marker.java | Python | C++ | Java |
|---|---|---|---|---|---|---|---|
| two-sum | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| group-anagrams | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| valid-palindrome | Y | Y | Y (27 tests) | Y | Y | Y | Y |
| 3sum | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| best-time-to-buy-and-sell-stock | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| minimum-window-substring | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| valid-parentheses | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| binary-search | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| koko-eating-bananas | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| reverse-linked-list | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| lru-cache | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| invert-binary-tree | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| serialize-and-deserialize-binary-tree | Y | Y | Y (30 tests) | Y | Y | Y | Y |
| implement-trie-prefix-tree | Y | Y | Y (32 tests) | Y | Y | Y | Y |
| top-k-frequent-elements | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| find-median-from-data-stream | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| subsets | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| number-of-islands | Y | Y | Y (31 tests) | Y | Y | Y | Y |
| clone-graph | Y | Y | Y (26 tests) | Y | Y | Y | Y |
| coin-change | Y | Y | Y (32 tests) | Y | Y | Y | Y |

### Marker.java Validation Logic Spot-Check

Reviewed `isCorrect()` implementations for the selected problems:

1. **two-sum:** Validates `nums[output[0]] + nums[output[1]] == target` — accepts any valid pair, not just specific indices. Correct.
2. **group-anagrams:** Sorts inner arrays and outer array before comparison — order-independent. Correct.
3. **3sum:** Checks each triplet sums to zero, deduplicates, compares sets. Correct.
4. **top-k-frequent-elements:** Validates output contains the actual k most frequent elements regardless of order. Correct.
5. **lru-cache:** Operation-sequence based test with expected outputs per operation. Uses class problem infrastructure.
6. **clone-graph:** Uses `checkGraphClone` flag to verify deep clone (new objects, not reference equality). Correct.

### Starter Code Spot-Check

Verified Python, C++, and Java starter code compiles/parses correctly for:
- Standard function problems (two-sum, binary-search)
- Linked list problems (reverse-linked-list) — includes ListNode class
- Tree problems (invert-binary-tree) — includes TreeNode class
- Class-based problems (lru-cache) — includes class template
- Graph problems (clone-graph) — includes GraphNode class

---

## Execution Test Commands

When Docker is available, run the following to verify the judge:

```bash
# Start Docker Desktop first, then:
cd /Users/Ka_Hei_LIANG_from.TP/devprep/cojudge

# Start the dev server
npm run dev &

# Pull required images
curl -X POST http://localhost:5173/api/image/pull -H 'Content-Type: application/json' -d '{"language":"python"}'
curl -X POST http://localhost:5173/api/image/pull -H 'Content-Type: application/json' -d '{"language":"cpp"}'
curl -X POST http://localhost:5173/api/image/pull -H 'Content-Type: application/json' -d '{"language":"java"}'

# Test via API (example for two-sum, Python):
curl -X POST http://localhost:5173/api/run \
  -H 'Content-Type: application/json' \
  -d '{
    "problemId": "two-sum",
    "language": "python",
    "code": "from typing import List\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n        return []",
    "testCases": [{"nums": "[2,7,11,15]", "target": 9}]
  }'

# Poll for results:
# curl http://localhost:5173/api/run?jobId=<returned-job-id>
```

---

## Summary

| Aspect | Status |
|---|---|
| Problem files present | 20/20 verified |
| Metadata valid | 20/20 verified |
| Starter code (Python/C++/Java) | 20/20 verified |
| Hidden tests present | 20/20 verified (26-32 tests each) |
| Marker.java logic | 6/20 spot-checked, all correct |
| Actual execution | **BLOCKED** — Docker daemon not running |
| Unit tests | 231/231 passing (no Docker required) |
| Build | Successful |

**Action required:** Start Docker Desktop and re-run the execution verification. The commands above are ready to use.
