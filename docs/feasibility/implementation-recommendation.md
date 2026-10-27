# Implementation Recommendation

**Date:** 2026-10-27
**Decision:** Fork Cojudge and extend it (Option A)

---

## Options Evaluated

### A. Fork Cojudge and extend it

Fork the repository, keep the existing SvelteKit frontend and Docker-based judge, and incrementally add DevPrep features.

### B. Reuse Cojudge's judge, build a new frontend

Extract the runner/marker subsystem and build a new frontend (e.g., React, Next.js) around it.

### C. Use Cojudge as reference, build a custom application

Study Cojudge's design and build DevPrep from scratch, using a different stack or architecture.

---

## Evaluation Matrix

| Criterion | A (Fork) | B (New Frontend) | C (Custom Build) |
|---|---|---|---|
| Time to working v1.0 | **1-2 weeks** | 4-6 weeks | 8-12 weeks |
| NeetCode 250 coverage | **250/250 immediate** | 250/250 (reuse content) | Must recreate content |
| Judge reliability | **Proven** (pending Docker verification) | Same judge | Must reimplement |
| 3-language support | **Immediate** (8 languages) | Same runners | Must reimplement |
| Test case library | **7,600+ tests ready** | Same content | Must recreate |
| Marker validators | **250 Marker.java files** | Same markers | Must recreate |
| Problem statements | **250 statements ready** | Same content | Must recreate |
| Future extensibility | Good (SvelteKit is modular) | Best (clean slate) | Best (clean slate) |
| Risk | **Lowest** | Medium | Highest |
| Content migration | **None needed** | Content layer extraction | Full recreation |

---

## Recommendation: Option A — Fork and Extend

### Rationale

1. **Complete content library:** All 250 NeetCode 250 problems with statements, test cases (7,600+), starter code (3 languages), validators, and solution walkthroughs are ready to use.

2. **Proven architecture:** The judge system handles standard functions, class-based problems, interactive problems, graph cloning, and multiple-valid-output problems via the Marker.java validator pattern. The runner system supports Python, C++, and Java (our v1.0 targets) plus 5 more languages.

3. **Working UI:** The SvelteKit frontend provides a functional code editor (Monaco), problem descriptions, test execution, submission, progress tracking, and a playground — all offline-first.

4. **Minimal changes needed for v1.0:**
   - Docker container security hardening (resource limits, network isolation)
   - Remove cloud sync / Firebase dependency
   - Remove Tauri desktop app concerns (optional — keep as future option)
   - Verify judge correctness with actual Docker execution tests
   - Document the setup procedure

5. **SvelteKit is suitable for extension:** Adding solution history, spaced repetition, practice modes, and other DevPrep features does not require a frontend rewrite. SvelteKit's file-based routing and server-side capabilities make it straightforward to add new pages and API endpoints.

6. **No rewrite justified:** Option B discards a working UI that already implements everything v1.0 needs. Option C discards both the UI and the judge, requiring months of work to reach the same baseline. Neither is justified when the existing code is MIT-licensed, well-structured, and functionally complete.

### What NOT to change initially

- **Don't rewrite the judge.** The `ProgramRunner` → `compile()` → `run()` → `Marker.java` pipeline is sound. Harden containers; don't redesign the execution model.
- **Don't rewrite the UI.** The SvelteKit frontend works. Polish it, don't replace it.
- **Don't switch to a database.** Browser localStorage for progress is fine for v1.0 single-user use. A database migration is a future task when multi-device sync becomes a requirement.
- **Don't add learning features yet.** The project specification explicitly defers these. Focus on making the judge reliable first.

---

## v1.0 Implementation Plan

### Phase 1: Fork and Verify (Week 1)

1. Fork the repository
2. Start Docker Desktop and complete judge verification (20-problem test suite documented in `judge-test-results.md`)
3. Fix any judge bugs discovered during verification
4. Add Docker container security hardening:
   - Memory limits (256MB)
   - CPU limits (1 core)
   - Network isolation (`NetworkMode: 'none'`)
   - PID limits (256)
5. Remove or disable Firebase/cloud sync (make it a no-op for offline-only mode)

### Phase 2: Polish and Document (Week 2)

6. Create a Docker image pre-pull script for offline use
7. Write user-facing setup documentation
8. Add automated judge integration tests (at least for the 20 representative problems)
9. Verify offline operation (disconnect network after initial setup)
10. Tag v1.0-alpha release

### Phase 3: Future DevPrep Features (Post v1.0)

These are deferred per the project specification:
- Solution history with timestamps
- Personal reflections / notes per problem
- Spaced repetition scheduling
- Practice mode (timed, random selection)
- CS fundamentals lessons
- Programming language lessons
- System design questions
- Server-side persistence (migrate from localStorage)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Judge bugs in specific problems | Medium | 20-problem verification suite; fix bugs as found |
| Docker image changes breaking runners | Low | Pin exact image tags in production |
| Upstream Cojudge changes we want | Low | Periodically review upstream for useful fixes |
| SvelteKit upgrade difficulties | Low | Current Svelte 5 / SvelteKit 2 is latest |
| localStorage data loss | Medium | Add export/backup feature (recovery page already exists) |
| Docker Desktop licensing | Low | Colima/Orbstack alternatives documented |

---

## Conclusion

Cojudge provides an excellent foundation for DevPrep v1.0. With 250 complete NeetCode 250 problems, a working 8-language judge, and a functional offline-first UI, the gap between the current state and our v1.0 requirements is primarily about verification and hardening, not construction. A fork-and-extend strategy delivers a working product in 1-2 weeks with minimal risk.
