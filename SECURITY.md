# Security Policy

## Supported versions

Andhrímnir is a student project under active development. Only the `main` branch receives security fixes. Feature branches, old tags and forks are not supported.

| Branch or version | Supported |
| --- | --- |
| `main` | Yes |
| Anything else | No |

## Reporting a vulnerability

Please report security problems privately, not in a public issue, pull request or discussion.

1. Open the repository on GitHub and go to **Security → Report a vulnerability** (the direct link is `https://github.com/Lucifer-Newstar/DineSmart/security/advisories/new`).
2. Describe the problem, the affected route or page, and the steps to reproduce it. A minimal proof of concept helps.
3. Do not include real customer data, live credentials or one-time codes. The seeded Saffron & Co. demo accounts are enough to show most problems.

The team aims to acknowledge a report within 3 working days and to share a first assessment within 7 working days. Fixes land on `main` through a reviewed pull request, and the advisory is published once a fix is available.

## Scope

In scope:

- The Express API in `backend/` (authentication, sessions, role-based access, tenant isolation, realtime notifications).
- The Next.js frontend in `frontend/` (session handling, rendering of user-supplied text, security headers).
- The GitHub Actions workflows in `.github/workflows/`.

Out of scope:

- Findings that need a compromised developer machine or a leaked `JWT_SECRET`.
- Denial of service by sending very large volumes of traffic.
- The public demo credentials documented in `backend/README.md`; they exist only for local seeded databases and must never be used in production.

## Safe harbour

Good-faith research that respects this policy, avoids privacy violations and does not degrade the service for others will not be pursued by the team.
