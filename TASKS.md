# DevPrep — Milestone Tracker

This is the authoritative development milestone tracker for DevPrep. Each milestone defines a discrete deliverable with acceptance criteria and required evidence.

**Current milestone:** M2.5

---

## M0 — Cojudge Feasibility and Baseline Assessment

**Objective:** Determine whether Cojudge is a viable foundation for DevPrep.

**Status:** Complete (static analysis only; runtime verification pending).

**Scope:**
- Repository inspection and architecture audit.
- NeetCode 250 problem inventory and gap analysis.
- Build and unit test verification.
- Implementation recommendation.

**Acceptance criteria:**

- [x] Architecture documented in [docs/feasibility/architecture-audit.md](docs/feasibility/architecture-audit.md).
- [x] All 250 NeetCode 250 problem folders verified present with complete files.
- [x] Problem inventory CSV generated ([docs/feasibility/problem-inventory.csv](docs/feasibility/problem-inventory.csv)).
- [x] Gap analysis completed ([docs/feasibility/neetcode250-gap-analysis.md](docs/feasibility/neetcode250-gap-analysis.md)).
- [x] `npm install` and `npm run build` succeed.
- [x] All 231 unit tests pass (`npm test`).
- [x] Implementation recommendation issued ([docs/feasibility/implementation-recommendation.md](docs/feasibility/implementation-recommendation.md)).
- [x] Full runtime judge verification completed — 78/78 tests passed (tracked under M0.1).

**Evidence:**
- Feasibility reports in [docs/feasibility/](docs/feasibility/).
- Unit test result: 231/231 passing.
- Build: clean success with CSS warnings only.
- Runtime verification: 60/60 correct accepted, 15/15 wrong rejected, timeout and errors detected.

**Blockers:** None.

---

## M0.1 — Docker Runtime Verification

**Objective:** Verify representative problems actually execute correctly across Python, C++, and Java using the Docker-based judge.

**Status:** Complete.

**Scope:**
- Start Docker Desktop and confirm daemon connectivity.
- Pull required Docker images (`python:3.11-slim`, `gcc:13`, `alpine/java:22-jdk`).
- Test at least 20 representative problems covering all NeetCode categories.
- For each problem: test correct solution, incorrect solution, and edge cases in all three languages.
- Verify timeout detection and error reporting.
- Document actual execution results.

**Dependencies:**
- Docker Desktop running on host machine.
- M0 complete.

**Acceptance criteria:**

- [x] Docker daemon accessible (Docker Desktop 4.73.0, Engine 29.4.3).
- [x] Required images pulled successfully (`python:3.11-slim`, `gcc:13`, `alpine/java:22-jdk`).
- [x] At least 20 problems tested across 3 languages (78 test runs: 60 correct + 15 wrong + 3 error handling).
- [x] Correct solutions accepted in all tested cases (60/60).
- [x] Incorrect solutions rejected in all tested cases (15/15).
- [x] Timeout correctly detected (Python `time.sleep(60)` → timeout after ~32s).
- [x] Error reporting includes meaningful messages (C++ and Java compilation errors with compiler output).
- [x] Results documented in [docs/feasibility/judge-test-results.md](docs/feasibility/judge-test-results.md).
- [x] All failures analysed and categorised — 0 judge bugs found; all initial failures were test script issues.

**Evidence:**
- Runtime test matrix: [docs/feasibility/runtime-test-matrix.csv](docs/feasibility/runtime-test-matrix.csv).
- Automated verification script: [scripts/verify-judge.mjs](scripts/verify-judge.mjs).
- Full results in [docs/feasibility/judge-test-results.md](docs/feasibility/judge-test-results.md).
- Verification plan for M2 expansion: [docs/feasibility/full-judge-verification-plan.md](docs/feasibility/full-judge-verification-plan.md).

**Blockers:** None.

**Key findings:**
- Zero judge bugs in 20-problem sample across 3 languages.
- Cojudge uses different type conventions from LeetCode (e.g., `int[][]` not `List<List<Integer>>`, int grids not char grids, wrapper functions for class problems). Solutions must match `metadata.json` → `starterCode`.
- The Marker validation system works correctly for standard, class-based, multi-answer, and graph-clone problems.

---

## M1 — Judge Reliability and Security Hardening

**Objective:** Ensure the code execution engine is reliable, secure, and works offline.

**Status:** Complete.

**Scope:**
- Fix any judge bugs discovered in M0.1.
- Add Docker container resource limits (memory, CPU, PIDs).
- Add network isolation (`NetworkMode: 'none'`).
- Drop unnecessary container capabilities.
- Verify offline operation (no network after initial image pull).
- Add automated judge integration tests.
- Prepare M2 full NeetCode 250 verification framework.

**Dependencies:**
- M0.1 complete (runtime judge verified).

**Acceptance criteria:**

- [x] All M0.1 bug fixes applied and retested (0 bugs found in M0.1).
- [x] Container resource limits enforced in all runners (512 MB, 1 CPU, 256 PIDs).
- [x] Containers cannot make network requests (`NetworkMode: 'none'`).
- [x] Container capabilities dropped (`CapDrop: ['ALL']`, `no-new-privileges`).
- [x] Container cleanup enhanced (/tmp and file cleanup between reuses).
- [x] Offline preparation script created (`scripts/prepare-offline.sh`).
- [x] Offline readiness smoke test created (`scripts/verify-offline.sh`).
- [x] Security changes documented in [ADR-0003](docs/adr/0003-docker-security-hardening.md).
- [x] Docker socket exposure analysed in [docs/feasibility/docker-socket-analysis.md](docs/feasibility/docker-socket-analysis.md).
- [x] M2 verification framework created with fixture-based loading.
- [x] 250-problem reference-solution inventory generated.
- [x] Verification manifest created (750 combinations tracked).
- [x] Existing unit tests pass (`npm test` — 241/241 passing, including 10 new security tests).
- [x] Type checking passes (`npm run check` — 32 pre-existing errors from upstream Cojudge, 0 from M1 changes).
- [x] Production build succeeds (`npm run build` — CSS warnings only, pre-existing).
- [x] M0.1 judge verification passes (78/78 via `verify-judge.mjs`).
- [x] Security integration tests pass (13/13 via `tests/judge/security-verification.mjs`).
- [x] Offline readiness smoke test passes (9/9 via `scripts/verify-offline.sh`).
- [x] True offline verification (host network disconnected) — 78/78 pass with Wi-Fi disabled (2026-10-28).

**Evidence:**
- Runtime verification report: [docs/feasibility/m1-runtime-verification-report.md](docs/feasibility/m1-runtime-verification-report.md).
- Container inspect: all 7 HostConfig properties confirmed.
- Runtime test matrix: [docs/feasibility/runtime-test-matrix.csv](docs/feasibility/runtime-test-matrix.csv).

---

## M2 — Inherited Library Acceptance and Regression Maintenance

**Objective:** Formally accept Cojudge's problem library as the DevPrep baseline and maintain regression coverage.

**Status:** Complete.

**Supersedes:** The original M2 ("Complete NeetCode 250 Verification — 750/750"). See [ADR-0004](docs/adr/0004-accept-inherited-cojudge-library.md).

**Scope:**
- Accept Cojudge's 250-problem library as inherited baseline.
- Maintain representative regression tests across Python, C++, and Java.
- Fix and regression-test content bugs as they are discovered.
- Preserve existing verification fixtures and tooling.

**Dependencies:**
- M1 complete (judge reliable and hardened).

**Acceptance criteria:**

- [x] All 250 NeetCode 250 problems available with complete files.
- [x] Representative regression tests pass across 3 languages (78/78 via verify-judge.mjs).
- [x] Content status tier system defined (Bundled / Statically checked / Runtime tested / Independently verified / Known issue).
- [x] ADR-0004 accepted.
- [x] Exhaustive 750/750 independent verification removed as release prerequisite.
- [x] Regression-testing obligations documented.

**Evidence:**
- ADR-0004: [docs/adr/0004-accept-inherited-cojudge-library.md](docs/adr/0004-accept-inherited-cojudge-library.md).
- M0.1 verification: 78/78 pass. M1 verification: 78/78 pass (including offline).

**Blockers:** None.

---

## M2.5 — Judge Performance and Usability

**Objective:** Investigate and improve Run/Submit latency; propose persistence architecture.

**Status:** In progress.

**Scope:**
- End-to-end latency instrumentation for Run and Submit pipelines.
- Reproducible benchmarks across Python, C++, and Java.
- Bottleneck identification (frontend polling, Docker pooling, compilation, Marker validation, batching, resource limits).
- Targeted performance optimisations.
- SQLite persistence architecture proposal (design only, no implementation).

**Dependencies:**
- M2 complete (library accepted, judge baseline stable).

**Acceptance criteria:**

- [ ] Run and Submit latency measured across Python, C++, and Java.
- [ ] Cold and warm execution differentiated.
- [ ] Main bottlenecks identified and ranked.
- [ ] Targeted optimisations implemented where justified.
- [x] Marker compilation cache implemented — 80–85% Python Run reduction, 65–72% C++ Run reduction (see [marker-cache-results.md](docs/performance/marker-cache-results.md)).
- [ ] Before/after results recorded with absolute values.
- [ ] Existing judge and security regression suites pass.
- [ ] Current localStorage persistence documented.
- [ ] SQLite alternatives compared and recommendation made.
- [ ] Proposed schema and migration strategy documented.
- [ ] ADR-0005 (persistence proposal) created with Proposed status.
- [ ] No database implementation introduced.

---

## M3 — Persistence and Learning History

**Objective:** Implement reliable persistence for solution history, notes, and progress.

**Status:** Not started.

**Scope:**
- Solution history: record every submission with timestamp, code, language, and verdict.
- Personal notes and reflections per problem.
- Progress tracking that survives browser data clearing.
- Backup and restore functionality.
- Persistence migration (per approved architecture from M2.5/ADR-0005).

**Dependencies:**
- M2.5 complete (performance baseline established, persistence architecture approved).

**Acceptance criteria:**

- [ ] Every submission recorded in history.
- [ ] Notes and reflections can be created, edited, viewed per problem.
- [ ] Progress survives application restart and browser data clearing.
- [ ] Backup creates a complete restorable archive.
- [ ] Restore from backup recovers all data.

---

## M4 — Coding Practice Enhancements

**Objective:** Add practice modes, search/filter improvements, and language cheatsheets.

**Status:** Not started.

**Scope:**
- Spaced repetition scheduling based on submission history.
- Structured sequential practice (work through a topic in order).
- Random problem selection with filters (difficulty, topic, study list, unsolved).
- Timed practice mode.
- Problem search by title/slug/keyword.
- Language-specific LeetCode syntax cheatsheets.

**Dependencies:**
- M3 complete (submission history exists for spaced repetition).

**Acceptance criteria:**

- [ ] Spaced repetition surfaces problems based on performance.
- [ ] Three practice modes functional: structured, random, timed.
- [ ] Search returns relevant results by title, slug, topic, and keyword.
- [ ] Filters work for difficulty, topic, study list, and completion status.
- [ ] At least Python, C++, and Java cheatsheets available.

---

## M5 — Learning Platform Expansion

**Objective:** Add CS fundamentals, programming language lessons, and MCQs.

**Status:** Not started. Post-v1.0.

**Scope:**
- Lesson content format and rendering.
- MCQ and scenario-based assessment engine.
- CS fundamentals topic library.
- Programming language depth modules (C++, Java, Python).
- System design modules.

**Dependencies:**
- M4 complete (v1.0 coding platform stable).
- Content format and assessment engine ADR approved.

---

## M6 — Adaptive Learning and Interview Plans

**Objective:** Rule-based mastery tracking, recommendations, and goal-specific preparation.

**Status:** Not started. Post-v1.0.

**Scope:**
- Proficiency tracking across coding and conceptual topics.
- Shared concept mastery influencing spaced repetition.
- Mixed daily review sessions.
- Focused deep-dive sessions.
- Optional role-specific interview preparation plans.

**Dependencies:**
- M5 complete (learning modules exist).
