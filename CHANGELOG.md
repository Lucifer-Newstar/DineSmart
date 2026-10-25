# Changelog

All notable changes to Andhrímnir (DineSmart) are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Commit scopes such as `S4-05` are the
task IDs in the [Sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md).

## [0.2.0] - Unreleased

Sprint 4, Day 1. Nothing in this entry has been deployed yet.

### Added

- Repository guard rails (S4-01): commitlint on pull requests and pushes, actionlint, CodeQL,
  Dependabot, issue forms, a pull request template, CODEOWNERS, `SECURITY.md` and
  `CONTRIBUTING.md`.
- End-to-end tests (S4-02): a Playwright suite covering sign-up, sign-in, password reset,
  ordering, booking, the kitchen queue, inventory, roles, realtime and security headers. It runs in CI
  against a MongoDB service container.
- Accessibility (S4-03): axe scans of every public page, dashboard section and dialog that fail on
  any serious or critical WCAG 2.2 AA violation, plus an accessibility statement.
- Security (S4-04): API security headers and a frontend Content Security Policy; an append-only audit
  log with a manager-only `GET /audit-logs`; a 15-minute lockout after five failed sign-ins; an
  origin check on cookie-based refresh and logout; a signed-in devices list where any session can be
  revoked; one middleware that rejects malformed IDs; and a secret scan in CI.
- Menu management (S4-05): manager routes and a dashboard page to add, edit, reorder and archive
  dishes; an 86 switch that greys sold-out dishes out live on the customer menu; prep station and
  prep minutes per dish; single-choice options such as portion and spice level, with price deltas
  applied to orders; and search, dietary and allergen filters on the customer menu.

### Changed

- The public menu now lists sold-out dishes flagged `isAvailable: false` instead of hiding them, and
  returns the saved category order.
- An order may hold the same dish on two lines when the chosen options differ.
- Dietary labels on the customer menu are written out as text, not shown by colour alone.

### Fixed

- Accessibility fixes from the axe and keyboard review (S4-03): muted text, badges and dashboard
  heading counts meet a 4.5:1 contrast ratio; small controls meet the 24 px target size; icon
  buttons' names match their visible text; the bag and notification dialogs trap and restore focus;
  menu categories follow the tabs pattern; focused elements stay clear of the sticky header; form
  errors are tied to their fields; wide tables scroll by keyboard; and live order and incident
  updates are announced politely.
- body-parser is updated to 2.4.0 for a high-severity advisory on compressed request bodies.

## [0.1.0]

The MVP delivered through Sprint 3. See the work logs in `Docs/Work Logs/` for its history.
