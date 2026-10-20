# Andhrímnir – Browser Triage Report (S3-07)

**Date:** 2026-10-20 · **Scope:** first real browser-level pass over the frontend. Everything below was measured with headless Chromium (Playwright 1.56.1) against a production `next start` build on Node `24.21.0`, with the API running in liveness-only mode because no MongoDB is available in this workspace.

## 1. Method

| Dimension | Detail |
| --- | --- |
| Routes | `/`, `/login`, `/register`, `/menu`, `/orders`, `/book`, `/dashboard` |
| Viewports | 1440×900 (desktop), 820×1180 (tablet), 390×844 (mobile) |
| Checks | console errors, uncaught page errors, failed requests, page-level horizontal overflow, elements escaping the viewport, control hit-area sizes, WCAG contrast ratios computed from `getComputedStyle`, `h1`/`lang`/`title` structure |
| Backend state | `MONGODB_URI` unset → API liveness only; operational routes return 503 and auth refresh returns 401 |

## 2. Findings and status

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Mobile `/dashboard` scrolled horizontally by 193 px | High (layout) | **Fixed** — `09f1e89` |
| 2 | Six standalone text controls were 12–15 px tall | Medium (WCAG 2.5.8) | **Fixed** — `09f1e89` |
| 3 | 108 text elements (91 colour/size combinations) below WCAG AA contrast | Medium/High (WCAG 1.4.3) | **Open — needs the owner's accessibility conformance decision** |
| 4 | Console 401/503/429 entries | Informational | Expected in this environment; UI fails closed (see §4) |
| 5 | Structure (one `h1` per page, `lang="en-IN"`, skip link, reduced-motion guard) | — | Pass |

### Finding 1 — mobile horizontal overflow

`.sr-only` is `position: absolute` with no offset, so a visually hidden label inside a table header kept its static position (x ≈ 583) and, having no positioned ancestor, escaped the `overflow-x: auto` clipping of `.table-scroll`. The document grew to 583 px wide on a 390 px viewport.

Fix: anchor `.sr-only` with `top: auto; left: 0` and make `.table-scroll` a containing block (`position: relative`). Re-verified: **0 routes** show page-level horizontal overflow at any of the three viewports.

### Finding 2 — control hit areas

Measured on mobile: `Explore insights` (15 px), `Review insight` (14 px), `Help & support` (12 px), `See all` / `View floor` (23 px), and two card-footer buttons. WCAG 2.5.8 (Target Size Minimum, AA) requires 24×24 CSS px for standalone controls; the inline-link exception does not apply to these.

Fix: `.text-link`, `.insight-teaser-footer button`, `.sidebar-tip button`, and `.app-footer button` now declare `min-height: 24px` with 2 px horizontal padding. The visual design is unchanged because the controls stay transparent. Re-verified: every dashboard control is ≥ 24 px tall.

### Finding 3 — contrast (open)

Computed contrast for every visible text node with its effective background. 108 elements across 91 distinct colour/size combinations fall below the AA threshold (4.5:1 for body text, 3:1 for large text). The worst cases are muted metadata and eyebrow text:

| Foreground | Background | Size | Ratio | Example |
| --- | --- | --- | --- | --- |
| `rgb(168, 176, 168)` | white | 8 px | 2.22 | "YOUR RESTAURANT, YOUR SHIFT" |
| `rgb(160, 170, 162)` | white | 8 px | 2.40 | table subline timestamps |
| `rgb(162, 155, 137)` | `rgb(251, 250, 246)` | 7 px | 2.65 | menu brand eyebrow |
| `rgb(155, 162, 152)` | `rgb(251, 250, 246)` | 8 px | 2.51 | menu section label |
| `rgb(154, 141, 118)` | `rgb(247, 245, 239)` | 9 px | 2.99 | landing eyebrow |
| `rgb(139, 148, 136)` | `rgb(251, 250, 246)` | 11 px | 3.01 | landing hero paragraph |

Remediating this is a design-token change (darkening the muted text scale and raising the smallest font sizes), not a local defect fix. The Implementation Decisions document lists **visual design approval and the accessibility conformance level** as pending owner decisions, so the palette is **not** changed here. Recommendation for when that decision lands: darken the muted text tokens to ≥ 4.5:1 on their card backgrounds and raise the 7–8 px scale to at least 11 px, then re-run this audit.

## 3. Regression guards added

- `frontend/test/styles-contract.test.mjs` (Gokul, `99dea5c`) asserts `.sr-only` is anchored and clipped, `.table-scroll` is a positioned scroller, each standalone text-control rule declares `min-height >= 24px`, and the skip-link/reduced-motion rules still exist.
- `frontend/test/interactive-controls.test.mjs` continues to reject empty click handlers, untyped buttons, and unnamed form controls.

## 4. Expected console output in this environment

| Status | Cause | UI behaviour |
| --- | --- | --- |
| 401 | `POST /api/v1/auth/refresh` on mount while signed out | Signed-out shell renders; no crash |
| 503 | Operational routes with no database | `/menu` shows "The live menu is unavailable", `/orders` prompts sign-in, `/dashboard` shows "Preview mode" with labelled sample data |
| 429 | Refresh rate limit (30/window/IP) hit by 21 rapid page loads | Pages still render; no user-visible error |

These are environment artifacts, not defects, but they mean the triage exercised **unavailable, empty, and preview states only**.

## 5. Limits — what this pass does not cover

- No live MongoDB, so authenticated role flows, live data states, WebSocket delivery, and AI recommendation states were never rendered.
- No manual visual design review: every check is DOM- or computed-style-based. Screenshots were captured but not visually inspected.
- Single engine (Chromium headless); no Safari/Firefox, no touch-device or screen-reader testing.
- No performance measurement in the browser (see the S3-10 section of the test plan).
