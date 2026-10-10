# Navin Jairam — Work Log

## 2026-10-10

### S1-02 — Branch Strategy

- **Branch:** `feature/S1-02-branch-strategy`
- Added the task-branch naming convention and feature-branch / pull-request workflow; the document is at `Docs/Planning/Branch-Strategy.md`.
- Linked the strategy from the README and development workflow.
- Recorded S1-02 as **Ready to Push** under the approved status policy; completion requires review and merge.
- **Validation:** `git diff --check`; documentation links and backlog entry reviewed.
- **Delivery:** committed locally; no remote push was made during this task.

### S3-11 — Documentation organization and README

- **Branch:** `feature/S3-11-documentation` (stacked on the local S1-02 branch by approval; integrate S1-02 first).
- Organized product, architecture, planning, and quality documents into topic folders; retained both member-guide formats.
- Merged backlog additions into the canonical backlog and preserved the original additions as a historical snapshot.
- Promoted the updated API inventory to the canonical API specification and linked it from the SDD.
- Replaced unsupported all-complete roadmap marks with a blank per-phase sign-off template.
- Normalized the product name and aligned the demo role list and authentication tests with the SRS.
- Incorporated the approved scope, roles/authentication, workflow, incident/health-score, AI/realtime, fallback, engineering, performance, and backlog-status decisions into the canonical docs.
- Updated the README and backlog. S1-01 is Complete, S1-02 is Ready to Push, and S3-11 remains In Progress pending final app setup/run instructions.
- **Validation:** all local Markdown links resolve; backlog additions and story totals were checked; auth/role alignment and fallback acceptance criteria were reviewed; `git diff --check` passes.
- **Delivery:** documentation only; no application code or remote push was made on this branch.

### S1-03 — Frontend setup standards and dependency review

- Approved Node.js `24.21.0` and Biome `2.5.15` in the implementation decisions.
- Removed the generated Next ESLint configuration and its five high-severity development-only advisories; installed Biome as the formatter/linter. No force downgrade was applied.
- Validated with Node `24.21.0`: Biome check, TypeScript typecheck, and production build passed; full `npm audit` and `npm audit --omit=dev` both report zero vulnerabilities.
- **Delivery:** security remediation is a separate Navin-authored commit on the local S1-03 branch; no remote push was made.

### S1-03 — README and status integration

- Updated the root README and frontend guide with the Node pin, scaffold scope, and local quality commands; added Dhanush's work-log link.
- This closes S3-11's pending setup/run instructions, so S3-11 is now **Ready to Push**. Marked S1-03 **Ready to Push** after its implementation and work log were committed and local checks passed. Other product workflows remain pending.
- **Validation:** local documentation links resolve and `git diff --check` passes.
- **Delivery:** documentation/status update committed locally; no remote push was made.

### S1-07 — Initial pull-request CI

- **Branch:** `feature/S1-07-ci-cd`, stacked on `feature/S1-03-nextjs-setup` because the frontend and Node pin are required inputs; integrate S1-03 first.
- Added GitHub Actions checks for the frontend on pull requests, pushes to `main`, and manual runs: clean install, dependency audit, Biome, optional test script, TypeScript typecheck, and production build. Backend checks activate when the backend package is added.
- No deploy job or secrets were added. After S1-04/S1-05, the gated backend CI checks run against its package and liveness/MongoDB-configuration tests; frontend feature tests are still pending. S1-07 remains **In Progress** because deployment/CD and a GitHub-run confirmation are outstanding.
- **Delivery:** local task branch only; no remote push was made.

### S1-04 — Setup documentation and CI integration

- Added the backend setup guide and updated the root README, implementation decisions, and backlog to reflect the new backend package and automated checks.
- Marked S1-04 **Ready to Push** after the owner-authored implementation and work log passed local checks. S1-07 remains **In Progress**; no GitHub run or deployment has occurred.
- **Validation:** local documentation links resolve and `git diff --check` passes; the S1-04 work log records the runtime/test/build/audit results.
- **Delivery:** documentation/status update committed locally; no remote push was made.

### S1-05 — Local-first MongoDB decision and documentation

- Recorded the owner-approved native MongoDB Node.js driver and local-Docker-first approach, with Atlas provisioning deferred; no ODM/schema decisions were invented.
- Updated the implementation decisions, backend and team setup guides, root README, and backlog. S1-05 remains **In Progress** because this workspace has no Docker daemon and the live database/Atlas connection is not verified.
- **Validation:** documentation links and YAML parse checks pass; no database credentials were added to the repository.
- **Delivery:** documentation/status update is local only; no remote push was made.

### S1-06 — Environment variable documentation

- Documented the explicit environment variable names and secret-handling policy; linked Gokul's work log and updated the README/setup guidance.
- Recorded S1-06 as **Ready to Push** after confirming `.env.example` remains trackable while real environment files are ignored. Placeholders do not configure OAuth, email, Gemini, or Atlas credentials.
- **Validation:** local Markdown links and ignore patterns verified; no secrets were committed.
- **Delivery:** documentation/status update is local only; no remote push was made.

### S1-08 — Schema documentation and status integration

- Updated the implementation decisions from a pending schema proposal to an initial recommended baseline, clearly separating the user's customer-tenancy approval from technical recommendations chosen on the user's instruction.
- Added the architecture schema reference with collection fields, relationships, tenant-scoped index plan, bootstrap/validation boundaries, and pending runtime rules. Updated the SDD, test plan, backend/root READMEs, assigned developer guide, backlog, and status summary.
- Kept S1-08 **In Progress** because no live MongoDB instance is available to verify the index bootstrap. No credentials or remote pushes were added.
- **Validation:** reviewed Markdown links and status alignment; `git diff --check` passes. Code-level tests/build results are recorded in Jegatheesan's work log.
- **Delivery:** architecture and shared-document changes remain local; no remote push was made.

### S1-09 — Authentication architecture and status integration

- Recorded assistant-selected JWT/session/security defaults in the implementation decisions without attributing them as separate owner approvals. Added the refresh-session collection and TTL/index details to the schema reference.
- Added `/auth/refresh` to the canonical endpoint inventory and updated the SDD, backend setup, test plan, environment variable list, README, and backlog status.
- S1-09 remains **In Progress** pending a live MongoDB persistence check; no secrets or remote pushes were added.
- **Validation:** documentation links and status alignment reviewed; `git diff --check` passes. Backend code/test/build results are recorded in Dhanush's work log.
- **Delivery:** shared documentation updates remain local; no remote push was made.

### S1-10 — Google OAuth architecture and status integration

- Recorded the assistant-selected Google Identity Services ID-token approach, verified-email linking rule, and no-self-provisioning policy as recommendations (not separate owner approvals).
- Updated the S1-08 user schema/index reference, API endpoint inventory, SDD, test plan, implementation decisions, backend/frontend environment examples, backend guide, README, and backlog status. Removed the unused client-secret placeholder from the selected ID-token flow.
- S1-10 remains **In Progress** until a real Google credential and live MongoDB integration are verified. No secrets or remote pushes were added.
- **Validation:** documentation links/statuses reviewed; `git diff --check` passes. Backend results are in Dhanush's work log.
- **Delivery:** shared documentation updates remain local; no remote push was made.

### S1-11 — Email OTP documentation and status integration

- Recorded the assistant-selected registration contract, pending Customer activation, HMAC-only OTP storage, password bounds, development-only mock code behavior, and process-local IP limits as recommendations; owner-approved OTP limits remain separately identified.
- Updated the API inventory, database schema reference, test plan, backend/root setup/status documentation, and S1-11 backlog status. Added Dhanush's implementation and validation results to the assigned work log.
- **Validation:** documentation/status consistency reviewed and `git diff --check` passes. The implementation is commit `cdf1ed8`; backend lint, tests, typecheck, build, and audit results are in Dhanush's log.
- **Status:** In Progress pending real email-provider and live MongoDB verification. No remote push or merge was made.

### S1-12 — RBAC implementation and area-branch policy

- Implemented `requirePermissions`, restaurant-scope enforcement, and customer resource-owner middleware from the approved role matrix. The recommendation is to derive tenant IDs from the signed principal, reject conflicting client IDs in path/query/body, and retain restaurant/owner filters in repository queries.
- Added role-matrix, allow/deny, customer ownership, and tenant-boundary tests. Product operations routes are not implemented yet, so S1-12 remains **In Progress** pending route-level integration.
- **Implementation commit:** `a24c9d9` (Navin). **Validation on Node `24.21.0`:** Biome, 25 backend tests, TypeScript typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities.
- On the owner's revised instruction, updated the branch policy to area branches (e.g. `feature/backend`, `feature/ai`, `feature/frontend`) while keeping task IDs in commits/logs. Renamed the uncommitted S1-12 branch to `feature/backend`; existing historical task branches remain unchanged.
- **Delivery:** local only; no push or merge. `feature/backend` is stacked on the local S1-11 branch pending end-of-project integration.

### S1-13 — Seed data documentation and status

- Documented the local-only seed target guard, deterministic fixture scope, demo accounts/password override, and repeatable upsert behavior. Updated the database schema reference, backend/root READMEs, test plan, implementation decisions, and backlog; added Jegatheesan's implementation results to his work log.
- **Validation:** documentation/status consistency reviewed; `git diff --check` passes. The seed implementation is commit `548f3aa`; lint, 27 tests, typecheck, build, and audit passed. Live MongoDB seed/re-run verification is unavailable without Docker/`mongod`.
- **Status:** In Progress pending live local MongoDB verification. No remote push or merge was made.

### S3-01 / S3-02 / S3-04 / S3-13 — AI recommendation flow

- **Branch:** `feature/ai`, created as an area branch on top of local `feature/backend`; no task-specific branch was created.
- Integrated Google's official `@google/genai` SDK `2.28.0` with the configurable, assistant-recommended `gemini-3.5-flash-lite` default. Added constrained JSON prompts/validation, tenant-filtered bounded incident context, strict priority/action/confidence validation, PII/identifier minimization, and deterministic incident-specific fallbacks for missing key, timeout/quota, and invalid provider output.
- Added Manager/Administrator-only `POST /api/v1/incidents/{incidentId}/recommendations`, tenant-scoped `GET /api/v1/recommendations`, per-IP generation rate limiting, and an upsert/unique index to keep one current advisory recommendation per incident. AI never mutates operational records.
- Documented the current model/SDK selection as an assistant recommendation (not a separate owner approval), alongside the open live-key verification requirement.
- **Implementation commit:** `ad4b0ed` (Navin). **Validation on Node `24.21.0`:** Biome, 31 backend tests, typecheck, production build, and `npm audit --audit-level=high` passed; zero vulnerabilities. Provider/context tests use fakes and no real Gemini request was made.
- **Status:** S3-01/02/04/13 remain **In Progress** pending a real Gemini API key/model check and live MongoDB persistence/index verification. No push or merge was made.
