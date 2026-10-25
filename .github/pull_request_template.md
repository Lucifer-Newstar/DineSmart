## Summary

<!-- What does this pull request change, and why? Link the backlog task IDs (for example S4-02). -->

## Changes by area

- Backend:
- Frontend:
- CI, tooling and tests:
- Docs:

## How to test

<!-- Exact commands or clicks a reviewer can repeat, on Windows and Linux. -->

## Checks run locally

| Check | Result |
| --- | --- |
| Backend `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | |
| Frontend `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | |
| End-to-end and axe (`npm run e2e` in `frontend/`) | |
| `node tools/demo-readiness.mjs --strict` and `node tools/api-contract-check.mjs --strict` | |

A local pass is not a GitHub Actions result. Do not tick an item you did not verify.

## Definition of Done

This list mirrors the Definition of Done in the [sprint backlog](../Docs/Planning/Andhrimnir_Sprint_Backlog.md#definition-of-done).

- [ ] Feature implemented and integrated.
- [ ] Code pushed to GitHub on a branch with commit messages that pass commitlint.
- [ ] Code reviewed by a team member who owns a different area.
- [ ] API and UI tested (unit, router and end-to-end tests updated where behaviour changed).
- [ ] Responsive interface verified (mobile and desktop widths).
- [ ] Documentation updated (README, API specification, guides or work logs as needed).
- [ ] Acceptance testing passed against the task's acceptance criteria.

## Notes for reviewers

<!-- Risks, follow-ups, screenshots, or anything that is intentionally out of scope. -->
