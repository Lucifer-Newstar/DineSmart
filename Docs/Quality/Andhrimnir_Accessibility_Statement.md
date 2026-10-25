# Andhrímnir Accessibility Statement

Andhrímnir aims to meet the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) at level AA for every customer page and every staff workspace.

## How it is checked

- **Automated scans.** `frontend/e2e/a11y.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core) with the WCAG 2.0, 2.1 and 2.2 A and AA rules on every public route, every dashboard section, the customer portal and the kitchen board. It also scans the open bag dialog, the sign-up code step and the open notification panel. A serious or critical violation fails the end-to-end suite, and the suite runs on every pull request (`.github/workflows/e2e.yml`).
- **Keyboard tests.** `frontend/e2e/a11y-keyboard.spec.ts` checks the notification panel, the bag dialog and the menu category tabs with the keyboard alone.
- **Unit tests.** `frontend/test/styles-contract.test.mjs` guards the 24px target size, the focus scroll padding, the skip link and the reduced-motion rule. The live-region, focus-trap and tab helpers have their own tests.

## What was fixed in Sprint 4 (S4-03)

| WCAG criterion | Problem found | Fix |
| --- | --- | --- |
| 1.4.3 Contrast (Minimum) | axe reported 1,030 text nodes under 4.5:1 (muted greys and golds on light cards) | Each colour darkened in its own hue until it passes on every background it is used on |
| 2.4.11 Focus Not Obscured | Focused fields could scroll under the sticky dashboard top bar | `scroll-padding-top` on the page; the fixed mobile bag button reserves space at the bottom |
| 2.5.8 Target Size (Minimum) | 26 standalone links, text buttons and inputs were 14 to 18px tall | A 24px minimum hit area |
| 3.3.1 Error Identification, 1.3.1 Info and Relationships | Sign-in, sign-up, reset and booking errors were not tied to their fields | `aria-invalid` and `aria-describedby` point each field at the error |
| 4.1.3 Status Messages | New orders and incident alerts appeared silently | A polite live region announces each new arrival once |
| 2.1.2 No Keyboard Trap, 2.4.3 Focus Order | Dialogs did not take or return focus | The bag dialog and notification panel move focus in, keep Tab inside, close on Escape and return focus |
| 2.1.1 Keyboard | Menu category tabs needed one Tab stop per category; wide tables could not be scrolled by keyboard | Arrow keys, Home and End move between tabs; table scrollers are focusable regions |
| 2.5.3 Label in Name | The bell and bag buttons had names that did not contain their visible text | Names now start with what the button shows |

## Known limitations

- Automated tools find roughly a third to a half of accessibility problems. No screen-reader session with NVDA, JAWS, VoiceOver or TalkBack, and no review by disabled users, has been done yet.
- The scans run in Chromium at 1280 × 900 only. Mobile layouts, Firefox and Safari have not been scanned.
- Charts are exposed as labelled images or short text summaries, not as full data tables.
- Placeholder text in search fields is lighter than 4.5:1. Placeholders are hints, and every field also has a label.
- Menu reordering, planned for S4-05, will use Move up and Move down buttons rather than drag and drop (WCAG 2.5.7).

## Reporting a problem

Open an issue with the **Bug report** form and put "Accessibility" in the title. Include the page, what you were trying to do, and the browser and assistive technology you use. Security problems go through [SECURITY.md](../../SECURITY.md) instead.
