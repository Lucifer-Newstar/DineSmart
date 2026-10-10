# Branch Strategy

This document records the current owner-directed workflow. On 2026-10-11, the owner directed that ongoing work use `main` only. The previously used task and area branches were integrated locally into `main` at `70f5fb4`; all other local branch references were deleted. No remote is configured, and no push or GitHub Actions run has been made.

## Current workflow

- Work directly on `main` unless the owner explicitly changes this instruction.
- Do not create task or area branches for new work under the current instruction.
- Keep each implementation/documentation commit traceable to its backlog task ID, for example `feat(S2-06): connect inventory UI to API`.
- Update the canonical backlog and assigned member work logs for each task. Use the prescribed member identities for implementation and member-specific logs; shared documentation, architecture, security, and integration work uses Navin's identity.
- Run the checks in `.github/workflows/ci.yml` locally when practical. A local pass is not a GitHub Actions result; do not claim remote CI, deployment, or live-service verification without evidence.
- Do not mark a task **Complete** until its Definition of Done and required integration/review criteria are met. Use **Ready to Push** for verified local work that has not been pushed.
- Do not push unless the owner explicitly asks.

## Recent integration

`feature/backend`, `feature/ai`, and `feature/frontend` were combined in dependency order on local `integration/ci-validation`, then fast-forwarded into `main`. All earlier local task-scoped branch tips were already contained in that history. The validation branch and all other non-`main` local branch references were then deleted at the owner's direction. The commits remain in `main`; no remote branch was affected.

## Repository settings not specified

Branch protection, required remote CI checks, reviewer counts, deployment credentials, and remote branch-deletion policy remain owner/GitHub settings. This workflow does not assume or configure those settings.
