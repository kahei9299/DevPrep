# ADR-0002: Retain Cojudge's Runtime Versions for v1.0

**Status:** Accepted

**Date:** 2026-10-27

## Context

DevPrep's initial task specification referenced "Java 17" as a target runtime. However, Cojudge's existing implementation uses newer versions for all three primary languages:

| Language | Docker Image | Effective Version |
|---|---|---|
| Python | `python:3.11-slim` | Python 3.11 |
| C++ | `gcc:13` | GCC 13, compiling with `-std=c++17` |
| Java | `alpine/java:22-jdk` | OpenJDK 22 |

The Java runner (`src/lib/runners/JavaRunner.ts`), the Marker validation system (`src/lib/markerRunner.ts`), and the container pool are all built and tested against these images. The 250 bundled `Marker.java` validators compile and run under JDK 22.

Downgrading Java to JDK 17 would require:
- Verifying all 250 Marker.java files compile under JDK 17.
- Testing for any JDK 22 API usage in generated harness code.
- Changing the Docker image in `src/lib/utils/javaUtil.ts`.
- Re-running the full 250-problem verification suite.

## Decision

Retain Cojudge's existing runtime versions for DevPrep v1.0:

- **Python 3.11** (`python:3.11-slim`)
- **C++17 on GCC 13** (`gcc:13`)
- **Java 22 on OpenJDK 22** (`alpine/java:22-jdk`)

Do not downgrade Java to JDK 17. The C++ standard flag (`-std=c++17`) remains unchanged.

## Alternatives Considered

### Downgrade Java to JDK 17

Would align with the original task specification's "Java 17" mention but introduces unnecessary risk and work. JDK 22 is a superset of JDK 17 — all JDK 17 code runs on JDK 22. There is no practical benefit to downgrading for interview preparation use.

### Upgrade to latest versions (Python 3.13, GCC 14, JDK 23)

Premature for v1.0. The current versions are recent and well-supported. Image upgrades can be evaluated post-v1.0 when the full 750-problem verification suite exists.

## Consequences

- Project documentation updated to reference actual versions instead of "Java 17".
- No changes to language runners, Docker images, or Marker.java files.
- Users writing Java solutions may use features up to JDK 22 (records, sealed classes, pattern matching, etc.).
- Future version upgrades are straightforward — change the image constant in the respective `*Util.ts` file and re-verify.

## Related

- Runner source: `src/lib/utils/javaUtil.ts:5` — `export const javaImage = 'alpine/java:22-jdk'`
- Runner source: `src/lib/utils/cppUtil.ts:6` — `export const cppImage = env.COJUDGE_CPP_IMAGE || 'gcc:13'`
- Runner source: `src/lib/utils/pythonUtil.ts:5` — `export const pythonImage = 'python:3.11-slim'`
- Architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md) — Language Runners table
