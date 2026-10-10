# Andhrímnir Database Fallback Strategy

## Andhrímnir – Database Fallback Strategy Document

Purpose
This document defines the database resilience and fallback strategy for the Andhrímnir AI Incident Intelligence Platform. The goal is to ensure that core restaurant operations remain functional even when the primary database or external services become unavailable. It aligns with the project's MVP-first architecture, MongoDB Atlas deployment, incident detection engine, and cloud-native design.

## 1. Objectives

- Maintain application availability during database failures.
- Prevent data loss for orders, reservations, inventory, and incidents.
- Allow graceful degradation instead of complete application failure.
- Enable rapid recovery with minimal manual intervention.
- Support the hackathon MVP while remaining extensible for production.

## 2. Primary Database

MongoDB Atlas is the primary database for Users, Customers, Restaurants, Menu Items, Orders, Reservations, Tables, Inventory, Incidents, Recommendations, Notifications and Bills.

## 3. Fallback Levels

Level 1 – Retry: Automatic retry with exponential backoff for transient failures.
Level 2 – Local Cache: Read frequently used data (menu, tables, configuration) from in-memory cache.
Level 3 – Local Queue: Queue write operations (orders, reservations, inventory updates) until connectivity returns.
Level 4 – Read-Only Mode: Dashboard and menu remain available while write operations are temporarily restricted.
Level 5 – Emergency Offline Mode: Critical restaurant operations continue locally and synchronize after recovery.

## 4. Component Strategy

Authentication: Existing JWT sessions remain valid; new logins unavailable if DB unreachable.
Menu: Serve cached menu.
Orders: Accept orders into local queue and sync later.
Reservations: Cache current reservations; queue new bookings.
Inventory: Use last known stock with warning banner.
Incident Engine: Continue rule-based detection using cached/queued events.
AI: If Gemini fails, return rule-based recommendations.
Dashboard: Display cached analytics with timestamp.

## 5. Synchronization

Queued writes are replayed in FIFO order after reconnection. Each record includes UUID, timestamp, retry count and synchronization status. Duplicate protection uses idempotent operation IDs.

## 6. Backup Strategy

- Daily automated MongoDB Atlas backups.
- Export seed data before releases.
- Version-controlled schema and migration scripts.
- Test restore process before final deployment.

## 7. Failure Detection

Database health endpoint checked periodically.
Timeout >5 seconds triggers retry.
Multiple failures switch application to fallback mode and notify administrators.

## 8. Recovery Procedure

1. Detect database availability.
2. Reconnect.
3. Validate schema.
4. Synchronize queued operations.
5. Verify integrity.
6. Return to normal mode.

## 9. Risks and Mitigations

MongoDB outage → Local queue + cached reads.
Network interruption → Retry and offline mode.
Data conflicts → Timestamp + UUID reconciliation.
AI outage → Static recommendations.
Deployment rollback → Restore latest backup.

## 10. Responsibilities

Navin: Design resilience, integration, recovery testing.
Jegatheesan: Database schema and synchronization.
Dhanush: Frontend fallback UI and notifications.
Gokul: Deployment, monitoring and backup validation.

## 11. Acceptance Criteria

- Cached menu loads when DB is unavailable.
- Queued orders synchronize after recovery.
- No duplicate records after replay.
- Dashboard clearly indicates fallback mode.
- Core MVP workflows continue with graceful degradation.

This strategy complements the project's MongoDB Atlas architecture, MVP scope, risk management plan, and cloud deployment approach described across the Product Vision, SRS, SDD, Project Planning, and Sprint Backlog documents, ensuring operational continuity even during infrastructure failures. It also supports the hackathon objective of delivering a reliable restaurant management platform with intelligent operational monitoring. fileciteturn0file23 fileciteturn0file27 fileciteturn0file28 fileciteturn0file24
