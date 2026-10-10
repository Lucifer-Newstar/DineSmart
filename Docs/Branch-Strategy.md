# Branch Strategy

This document closes backlog item **S1-02 — Branch Strategy**. It applies the feature-branch and pull-request workflow described in the project plan.

## Base branch

- `main` is the repository's integration baseline.
- Start a task branch from the latest `main`; do not commit feature work directly to `main`.

## Branch naming

Use one task-scoped branch per backlog item:

```text
feature/<task-id>-<slug>
```

Use the backlog task ID and a short, lowercase, hyphen-separated slug. Example:

```text
feature/S1-02-branch-strategy
```

## Workflow

1. Update the local `main` from `origin/main` before starting a new task.
2. Create the task branch from `main` and keep its changes scoped to that task.
3. Run the relevant checks and update related documentation before requesting review.
4. Integrate task branches through a pull request rather than committing feature work directly to `main`.

## Repository settings not specified

The project documents do not define branch-protection rules, required CI checks, reviewer counts, merge method, or branch-deletion policy. This strategy does not assume or configure those settings; decide them before enabling them on GitHub.
