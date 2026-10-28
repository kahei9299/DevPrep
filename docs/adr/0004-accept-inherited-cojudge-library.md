# ADR-0004: Accept Inherited Cojudge Problem Library

**Status:** Accepted

**Date:** 2026-10-28

## Context

DevPrep's original verification strategy required independently executing and verifying all 250 NeetCode 250 problems across Python, C++, and Java (750 language-problem combinations) before proceeding with feature development. This was defined in the M2 milestone.

Through M0.1 and M1, the project completed:

- Static inventory of all 250 problem directories, confirming complete files (metadata, statements, test cases, validators, starter code).
- Representative runtime verification: 78/78 tests passed across 20 problems in 3 languages (60 correct accepted, 15 wrong rejected, timeout and error detection confirmed).
- Docker security hardening with resource limits, network isolation, and capability dropping.
- True offline verification (78/78 with host network disconnected).
- Zero judge bugs discovered across all testing.

The product owner has tested the current web application and is comfortable accepting Cojudge's existing question library as DevPrep's inherited baseline. The primary concern is now judge performance and usability, not exhaustive content verification.

Exhaustive 750-combination verification would delay feature development by weeks while yielding diminishing returns: the representative sample found zero judge bugs, and the judge architecture (runner + Marker.java validator) is consistent across all problems.

## Decision

Accept Cojudge's existing problem library as the inherited product baseline. Replace the exhaustive 750/750 independent verification requirement with the following acceptance criteria:

### Library acceptance criteria

1. All 250 NeetCode 250 problems are available in the application.
2. Required metadata, statements, starter templates, validators, and tests are present for each problem.
3. Run (sample tests) and Submit (hidden tests) operate across Python, C++, and Java.
4. Representative regression tests pass across diverse problem types and all three languages.
5. Known critical content or judging defects are fixed and covered by regression tests.
6. Newly discovered bugs receive reproducible regression tests.
7. The original library remains available for offline use.
8. Problems are not misrepresented as independently verified.

### Content status tiers

Each problem-language combination has one of:

| Tier | Meaning |
|---|---|
| **Bundled** | Files present in the repository; not independently tested by DevPrep. |
| **Statically checked** | Metadata, test cases, and starter code validated for structural completeness. |
| **Runtime tested** | Correct and incorrect solutions executed against the judge with expected results. |
| **Independently verified** | Full independent audit of test cases, edge cases, and validator behaviour. |
| **Known issue** | A confirmed bug with a tracked fix or documented workaround. |

All 250 problems are Bundled and Statically checked. Twenty problems are Runtime tested across three languages (M0.1). No problems have been Independently verified. No Known issues exist at this time.

### Regression-testing obligations

- Changes to runners, validators, metadata schemas, input/output formats, or judging behaviour must trigger representative regression testing.
- Newly discovered content bugs must be fixed and covered by a regression test before the fix is merged.
- Existing verification fixtures and tooling (verify-judge.mjs, security-verification.mjs, verify-offline.sh) must be preserved and kept passing.

## Alternatives Considered

### Continue exhaustive 750/750 verification

Verifying every combination systematically before any feature work. This was the original M2 plan.

- **Pro:** Maximum confidence in content correctness.
- **Con:** Estimated 2-4 weeks of effort with diminishing returns. The representative sample found zero bugs in 78 tests. The Marker.java validator pattern is architecturally consistent. Delays all feature development including performance, persistence, and practice modes.

### Verify on demand as problems are used

No upfront verification; test individual problems only when users report issues.

- **Pro:** Zero upfront effort.
- **Con:** Users discover bugs during practice, eroding trust. No regression safety net. Unacceptable for a study tool where incorrect verdicts are harmful.

### Sample-based statistical verification

Test a statistically significant random sample (e.g., 50-100 problems) to estimate the defect rate.

- **Pro:** More coverage than current 20-problem sample.
- **Con:** Still does not guarantee individual problem correctness. The 20-problem sample already covers all major categories and found zero bugs. The marginal value of a larger sample is low.

## Consequences

### Positive

- Feature development (performance, persistence, practice modes) can proceed immediately.
- The 20-problem regression suite provides a maintained safety net.
- The tier system provides honest status reporting without overstating verification.
- Resources are directed toward user-visible improvements rather than exhaustive verification.

### Negative

- Undiscovered content bugs may exist in untested problems. Users may encounter incorrect verdicts.
- The project cannot claim that all 750 combinations have been independently validated.
- Expanded verification may be necessary if bug reports reveal a higher-than-expected defect rate.

### Conditions for expanded verification

Expanded verification should be reconsidered if:

- Multiple content bugs are discovered in a short period, suggesting a systemic issue.
- A change to the runner or Marker architecture affects content compatibility.
- The project prepares for public distribution beyond single-user local use.
- A specific category of problems shows a pattern of failures.

## Related

- Files: [PROJECT.md](../../PROJECT.md), [TASKS.md](../../TASKS.md), [ARCHITECTURE.md](../../ARCHITECTURE.md).
- Evidence:
  - M0.1 runtime verification: [docs/feasibility/judge-test-results.md](../feasibility/judge-test-results.md) (78/78 pass).
  - M1 runtime verification: [docs/feasibility/m1-runtime-verification-report.md](../feasibility/m1-runtime-verification-report.md) (78/78 pass, 13/13 security, offline verified).
  - Problem inventory: [docs/feasibility/problem-inventory.csv](../feasibility/problem-inventory.csv) (250/250 complete).
  - Gap analysis: [docs/feasibility/neetcode250-gap-analysis.md](../feasibility/neetcode250-gap-analysis.md).
- Supersedes: The original M2 milestone ("Complete NeetCode 250 Verification — 750/750").
