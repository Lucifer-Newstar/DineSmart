# Branch Strategy

This document records the current owner-directed workflow. The original setup used one branch per backlog item; going forward, implementation is grouped by durable work area so dependent work can be reviewed together without creating a branch for every feature.

## Integration policy

- `main` is the integration baseline; do not commit product work directly to it.
- Keep all implementation branches local and unmerged while the project is being built. The owner pushes and merges the completed area branches at the end, in dependency order.
- Do not mark a task **Complete** before its Definition of Done and merge requirements are met.

## Area branches

Create one branch for each major implementation area, using a short area name:

```text
feature/backend
feature/ai
feature/frontend
feature/release
```

Keep later tasks from the same area on that area's branch. When an area depends on an unmerged area, stack the new area branch on its latest local head and record the dependency in the work log. Do not create a separate branch for every backlog item. Existing `feature/Sx-yy-slug` branches are historical work and remain intact; new branches follow the area convention.

## Task-level traceability

Branches are area-scoped, but work remains backlog-task-scoped:

- Put the task ID in every implementation/documentation commit subject, e.g. `feat(S1-12): add role authorization middleware`.
- Update the canonical backlog and assigned work logs for each task.
- Keep member-specific commits attributed to the prescribed Git identity. Shared docs, architecture, security, integration and release coordination use Navin's identity.
- Run the relevant checks and record any unavailable live integration before moving the next task forward.

## Workflow

1. Start from the latest local dependency head; do not fetch/push/merge on behalf of the owner.
2. Create an area branch only when beginning work in a new area. Reuse it for subsequent tasks in that area.
3. Implement and commit tasks in backlog order where dependencies permit; use task IDs in commit subjects and work logs.
4. Keep area branches stacked when required by dependencies. At the end, the owner pushes/reviews/merges them in dependency order.
5. Do not rewrite existing commit history or backdate commits. New work uses the current local date.

## Repository settings not specified

Branch protection, required CI checks, reviewer counts, merge method, deployment credentials, and branch-deletion policy remain owner/GitHub settings. This workflow does not assume or configure those settings.
