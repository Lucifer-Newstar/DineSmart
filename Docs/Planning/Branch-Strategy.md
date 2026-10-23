# Branch Strategy

This document records the team's current workflow. Since 2026-10-11 all work goes directly onto `main`. The earlier task and area branches were integrated into `main` at `70f5fb4` and then deleted. `main` is published on GitHub as `Lucifer-Newstar/DineSmart`, and history on `main` is kept linear: commits are fast-forwarded, with no merge commits.

## Current workflow

- Work directly on `main` unless the team lead changes this rule.
- Do not create task or area branches for new work under the current instruction.
- Keep each implementation/documentation commit traceable to its backlog task ID, for example `feat(S2-06): connect inventory UI to API`.
- Update the canonical backlog and assigned member work logs for each task. Use the prescribed member identities for implementation and member-specific logs; shared documentation, architecture, security, and integration work uses Navin's identity.
- Run the checks in `.github/workflows/ci.yml` locally before pushing. A local pass is not a GitHub Actions result; do not claim CI, deployment, or live-service verification without evidence.
- Do not mark a task **Complete** until its Definition of Done and required integration/review criteria are met. Use **Ready to Push** for verified work on `main` that still needs live verification or deployment.
- Navin pushes `main` to GitHub; rebase or fast-forward instead of creating merge commits.

## Recent integration

`feature/backend`, `feature/ai`, and `feature/frontend` were combined in dependency order on local `integration/ci-validation`, then fast-forwarded into `main`. All earlier local task-scoped branch tips were already contained in that history. The validation branch and all other non-`main` local branch references were then deleted by team decision. The commits remain in `main`.

## Repository settings not specified

Branch protection, required remote CI checks, reviewer counts, deployment credentials, and remote branch-deletion policy remain GitHub repository settings. This workflow does not assume or configure those settings.
