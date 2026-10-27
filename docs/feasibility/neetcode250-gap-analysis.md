# NeetCode 250 Gap Analysis

**Date:** 2026-10-27
**Source:** Cojudge v0.8.8 bundled `courses/nc250/courseinfo.json` and `problems/` directory

---

## Coverage Summary

| Metric | Count |
|---|---|
| NeetCode 250 problems in courseinfo.json | 250 |
| Problem folders present | 250 / 250 (100%) |
| With metadata.json | 250 / 250 (100%) |
| With statement.md | 250 / 250 (100%) |
| With official-tests.json | 250 / 250 (100%) |
| With Marker.java | 250 / 250 (100%) |
| With Python starter code | 250 / 250 (100%) |
| With C++ starter code | 250 / 250 (100%) |
| With Java starter code | 250 / 250 (100%) |
| With solution.md | 250 / 250 (100%) |

**All 250 NeetCode 250 problems are present with complete file sets.**

---

## Course Hierarchy

| Course | Problem Count | Relationship |
|---|---|---|
| Blind 75 | 75 | Subset of NC150 (74 overlap, 1 extra: `combination-sum-iv`) |
| NeetCode 150 | 150 | Subset of NC250 |
| NeetCode 250 | 250 | Superset of NC150 + 100 additional |
| Basic 50 | 50 | Separate beginner course |
| LeetCode 1000 | ~1000 | Extended collection |

The NC250 is a strict superset of NC150. Every NC150 problem appears in NC250.
Blind 75 is almost entirely contained in NC150 (74/75 overlap), with `combination-sum-iv` appearing only in the Blind 75 list, not NC150 — but it IS present in NC250.

---

## NeetCode 250 Category Breakdown

| Category | Problem Count | Sample Problems |
|---|---|---|
| Arrays & Hashing | 21 | two-sum, contains-duplicate, first-missing-positive |
| Two Pointers | 13 | valid-palindrome, 3sum, trapping-rain-water |
| Sliding Window | 9 | best-time-to-buy-and-sell-stock, sliding-window-maximum |
| Stack | 15 | valid-parentheses, largest-rectangle-in-histogram |
| Binary Search | 14 | binary-search, median-of-two-sorted-arrays |
| Linked List | 14 | reverse-linked-list, lru-cache, reverse-nodes-in-k-group |
| Trees | 23 | invert-binary-tree, serialize-and-deserialize-binary-tree |
| Heap | 12 | find-median-from-data-stream, task-scheduler |
| Backtracking | 16 | subsets, n-queens, word-break-ii |
| Tries | 4 | implement-trie-prefix-tree, word-search-ii |
| Graphs | 20 | number-of-islands, word-ladder |
| Advanced Graphs | 10 | alien-dictionary, network-delay-time |
| DP 1D | 17 | climbing-stairs, longest-increasing-subsequence |
| DP 2D | 16 | unique-paths, edit-distance, burst-balloons |
| Greedy | 14 | maximum-subarray, jump-game, candy |
| Intervals | 7 | merge-intervals, meeting-rooms-iii |
| Math & Geometry | 13 | rotate-image, spiral-matrix, detect-squares |
| Bit Manipulation | 10 | single-number, reverse-bits, sum-of-two-integers |
| **Total** | **250** | |

---

## Category Naming: Cojudge vs NeetCode

| NeetCode Official | Cojudge NC250 | Cojudge NC150 | Cojudge Blind 75 |
|---|---|---|---|
| Arrays & Hashing | `arrays-hashing` | `array` | `array` |
| Two Pointers | `two-pointers` | `two-pointer` | — |
| Sliding Window | `sliding-window` | `sliding-window` | — |
| Stack | `stack` | `stack` | — |
| Binary Search | `binary-search` | `binary-search` | — |
| Linked List | `linked-list` | `linked-list` | `linked-list` |
| Trees | `trees` | `tree` | `tree` |
| Heap / Priority Queue | `heap` | `heap` | `heap` |
| Backtracking | `backtracking` | `backtracking` | — |
| Tries | `tries` | `trie` | — |
| Graphs | `graphs` | `graph` | `graph` |
| Advanced Graphs | `advanced-graphs` | `advanced-graph` | — |
| 1-D Dynamic Programming | `dp-1d` | `dp-1d` | `dp` |
| 2-D Dynamic Programming | `dp-2d` | `dp-2d` | — |
| Greedy | `greedy` | `greedy` | — |
| Intervals | `intervals` | `interval` | `interval` |
| Math & Geometry | `math-geometry` | `math` | — |
| Bit Manipulation | `bit-manipulation` | `binary` | `binary` |

Category names vary slightly between courses (plural vs singular) but are consistent within each course.

---

## Missing Problems: None

All 250 NeetCode 250 problems are present in Cojudge's bundled content.

---

## Test Case Coverage

| Metric | Min | Max | Median | Mean |
|---|---|---|---|---|
| Public tests per problem | 1 | 7 | 3 | 3.3 |
| Hidden tests per problem | 9 | 82 | 32 | 38.6 |
| Total hidden tests (all 250) | | | | 9,643 |

Most problems have 25-55 hidden tests. A few outliers have fewer (9) or more (82).

---

## Starter Code Language Coverage

Every problem includes starter code for all 8 supported languages:
- Python, C++, Java, TypeScript, Rust, Go, C#, PHP

DevPrep's Phase 1 focus on Python, C++, and Java is fully covered.

---

## Special Problem Types

| Type | Count | Examples |
|---|---|---|
| Standard function | ~220 | two-sum, binary-search, coin-change |
| Class-based (stateful) | ~20 | lru-cache, lfu-cache, min-stack, design-twitter, find-median-from-data-stream |
| Interactive (API problems) | ~5 | guess-number-higher-or-lower, find-in-mountain-array |
| Graph clone | ~3 | clone-graph |
| Multiple valid outputs | ~40 | two-sum, group-anagrams, 3sum, subsets |

All special types have appropriate Marker.java validators with custom `isCorrect()` logic.

---

## Overall Assessment

Cojudge provides **complete NeetCode 250 coverage** with:
- All 250 problem folders present
- Complete metadata, statements, and test cases
- Starter code for Python, C++, and Java (plus 5 more languages)
- Marker.java validators for all problems
- Solution walkthroughs for all problems
- Adequate hidden test case counts (20-35 per problem)

**No gaps to fill** for NeetCode 250 coverage. The focus should shift to verifying judge correctness through actual execution testing (requires Docker).
