# Andhrímnir – Hackathon Presentation Plan

**Status:** Draft for S3-12 (Presentation & Demo). This is a preparation document, not a delivered slide deck, and not a claim that the demo has been rehearsed on live services.

Scope: a 10-minute hackathon presentation plus a 5-minute live demo, aligned with the [Demo Strategy & Mock Data Structure](../Quality/Andhrimnir_Demo_Strategy_and_Mock_Data_Structure.md), the [Product Vision](../Product/Andhrimnir_Product_Vision_Document.md), the approved MVP scope, and the [canonical sprint backlog](Andhrimnir_Sprint_Backlog.md). Slide timings assume one presenter; trim the optional slides for a 7-minute slot.

## 1. Narrative arc

| Time | Slide | Message | Evidence to show |
| --- | --- | --- | --- |
| 0:00–0:45 | 1. Title | Andhrímnir: AI Incident Intelligence for Restaurants | Name, tagline, team |
| 0:45–1:45 | 2. Problem | Restaurant incidents are discovered by customers, not systems | Delay, stock-out, and double-booking costs |
| 1:45–2:30 | 3. Solution | Detect → contextualize → recommend → observe | Lifecycle diagram from the SDD |
| 2:30–3:15 | 4. Architecture | Next.js frontend, Express 5 API, MongoDB, Gemini-backed advisory layer | [Software Design Document](../Architecture/Andhrimnir_Software_Design_Document_SDD.md) |
| 3:15–4:15 | 5. Role model | One workspace, five roles, server-authoritative permissions | Role matrix in [Implementation Decisions](../Architecture/Andhrimnir_Implementation_Decisions.md) |
| 4:15–5:15 | 6. Incident intelligence | Rule-managed detection, bounded context, advisory AI with deterministic fallback | Live incidents view or, if services are down, labeled sample preview |
| 5:15–6:00 | 7. Health score | Six weighted components, explainable per-component output | Health score card |
| 6:00–6:45 | 8. Analytics | Tenant-scoped operational reporting with explicit truncation | Orders/reservations/prep charts |
| 6:45–7:30 | 9. Engineering quality | Biome, TypeScript, 283 backend and 29 frontend tests, CI workflow, secret-free env examples | Test output, `.github/workflows/ci.yml` |
| 7:30–10:00 | 10. Live demo | Customer → staff → incident → recommendation flow | [Demo Runbook](../Quality/Andhrimnir_Demo_Runbook.md) |
| 10:00–11:00 | 11. Roadmap and limits | Honest boundaries: no payments, no Atlas verification yet, deployment pending | Status tables in the README |

## 2. Slide content

1. **Title** — Andhrímnir, AI Incident Intelligence Platform for Restaurants; repository `DineSmart`; team roles (frontend, backend, AI, docs/QA).
2. **Problem** — Service delays, stock-outs, and reservation conflicts surface through complaints. Staff dashboards show state but not causes.
3. **Solution** — Operational writes trigger rule evaluation; an incident carries bounded, tenant-scoped evidence; Gemini generates advisory recommendations and a deterministic fallback keeps the flow usable; incidents resolve automatically when their condition clears.
4. **Architecture** — Next.js 16 App Router frontend; Express 5 + TypeScript API under `/api/v1`; official MongoDB Node driver; scheduled sweeps plus event hooks; WebSocket transport with ACK-based delivery.
5. **Role model** — Customer, Reception, Kitchen Staff, Manager, Administrator; tenant derived from the signed principal; client-supplied `restaurantId` rejected on mismatch.
6. **Incident intelligence** — Supported rules (kitchen/order delay, kitchen congestion, inventory shortage, reservation conflict), bounded 2,000-record scans, 200-record API cap, one active record per restaurant/type/entity, fresh ID on recurrence.
7. **Health score** — Six weighted components with neutral-50 handling for missing data and a 2,000-record observation cap; hourly plus event-driven refresh.
8. **Analytics** — `7d`/`30d` windows, restaurant-local buckets, operational counts (not revenue), explicit truncation flags.
9. **Engineering quality** — Biome, `tsc --noEmit`, Node test runner suites, CI workflow on Node 24.21.0, secret-free `.env.example` files, pinned dependencies.
10. **Live demo** — Follow the runbook; keep the sample-preview labels visible if any live service is unavailable.
11. **Roadmap and limits** — Payments, Atlas verification, deployment, notification recipient policy, and waitlist-dependent rules are documented open items rather than completed features.

## 3. Judging-criteria mapping

| Criterion | How the talk addresses it | Honest current state |
| --- | --- | --- |
| Functionality | End-to-end customer and staff workflows, incident lifecycle, advisory AI | Locally verified with fake/unit tests; live MongoDB browser E2E outstanding |
| User Experience | Role-aware workspace, explicit loading/empty/unavailable/preview states | Responsive acceptance and browser review not yet performed |
| Innovation | Bounded context builder, PII minimization, deterministic fallback | Fallback verified locally; live Gemini check pending a key |
| Problem Solving | Proactive detection with explainable root cause and recommended actions | Supported rules verified locally; waitlist/staffing rules need inputs |
| Code Quality | Modular packages, Biome, strict TypeScript, tests beside modules | Local CI-equivalent passes; no GitHub Actions run yet |
| Scalability | Cloud-ready stateless API, indexes, bounded queries and caps | Index/live database behavior unverified |
| Deployment | Planned frontend/backend deployment under S3-08/S3-09 | Deferred until non-deployment work is finished |

## 4. Presenter notes

- Lead with the incident, not the dashboard: show one detected kitchen delay, its trigger snapshot, and the advisory actions.
- Always say "advisory" for AI output. The platform never mutates operational records from model output.
- If a live service fails, narrate the fallback: the UI keeps sample content visibly labeled as preview and never presents it as live data.
- Never describe pre-bill subtotals as revenue, and never imply payment capture.
- Close on the documented limits; judges respond better to stated boundaries than to overclaiming.

## 5. Open preparation items

- Slide deck authoring (this plan is the outline, not the rendered deck).
- A recorded backup demo in case the live environment is unavailable during the slot.
- Rehearsal against live MongoDB and a real Gemini key once credentials exist.
