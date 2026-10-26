# Changelog

All notable changes to Andhrímnir (DineSmart) are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Commit scopes such as `S4-05` are the
task IDs in the [Sprint backlog](Docs/Planning/Andhrimnir_Sprint_Backlog.md).

## [0.3.0] - Unreleased

Sprint 5, Day 2. Nothing in this entry has been deployed yet.

### Added

- Reservations 2.0 (S5-01): bookable slots computed from tables, turn times by party size and
  opening hours, with a per-15-minute pacing cap, a minimum lead time and a booking window; customers
  change or cancel their own bookings until the restaurant's cutoff from a new My bookings page;
  staff mark arrivals, seat guests at a suggested best-fit table and record no-shows from a day
  timeline; walk-in wait quotes from the current floor; booking rules in settings.
- Guest profiles and privacy (S5-02): visit, last-visit and no-show counts with staff tags and notes
  beside each booking; an account page for name, contact preferences and password changes; data
  export as JSON and account deletion; a privacy notice.
- QR dine-in ordering and live tracking (S5-03): printable signed QR cards per table that open the
  menu in dine-in mode; special requests per line shown on kitchen tickets; an estimated ready time;
  a live tracking page for the customer; reorder in one tap.
- Customer notifications (S5-04): booking confirmation emails with a calendar file, notices when
  staff change or cancel a booking, day-before reminders sent once, order-ready notices for
  customers and a waiter alert for Reception on dine-in orders, per-user notification preferences,
  mark all as read, and shared HTML and plain-text email templates. Emails go through the configured
  transport; the development default sends nothing.
- Installable app and offline reading (S5-05): a web app manifest and icons, a service worker with
  an offline page, the last loaded menu readable offline with ordering turned off, and a connection
  banner in the workspace. An offline end-to-end spec covers them.

### Changed

- A booking's end time now comes from the turn time for its party size instead of a fixed 90
  minutes.
- Buttons styled as secondary links on the customer pages have no button background and use a
  darker green.
- The end-to-end API run skips the socket-ticket rate limit under the same `NODE_ENV=test` switch as
  the sign-in limits; production keeps the limit.

### Fixed

- The waiter alert for a ready dine-in order is now actually sent to Reception staff.
- The offline page saves its own scripts and styles so it renders without a network.
- Accessibility: the guest profile button's name starts with its visible text, and the order again
  and track order links meet the 4.5:1 contrast ratio.

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
