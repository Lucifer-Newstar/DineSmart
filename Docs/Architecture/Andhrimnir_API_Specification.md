# Andhrímnir API Specification

## Canonical API Endpoint Inventory

This is the canonical endpoint inventory for the MVP. Paths below are relative to the approved `/api/v1` base path. The endpoint table consolidates the initial API design and later additions for authentication, reservations, billing, staff, waitlist, table management, and notifications. Request/response schemas, error envelopes, and detailed authorization rules remain **draft decisions** pending approval; see [Implementation Decisions](Andhrimnir_Implementation_Decisions.md). S1-09 implements the login, refresh, and logout session flows; registration remains part of S1-11 and password reset remains S2-15.

| Method | Endpoint | Description | Owner |
| --- | --- | --- | --- |
| POST | /auth/register | Register user | Dhanush |
| POST | /auth/login | Login user | Dhanush |
| POST | /auth/refresh | Rotate refresh session and renew access token | Dhanush |
| POST | /auth/logout | Secure logout | Dhanush |
| POST | /auth/google | Verify Google Identity Services ID token and start a session | Dhanush |
| POST | /auth/reset-password | Password reset | Dhanush |
| GET | /menu | Get digital menu | Dhanush |
| POST | /reservations | Create reservation | Jegatheesan |
| GET | /reservations | Get reservations | Jegatheesan |
| PUT | /reservations/{id} | Update reservation | Jegatheesan |
| GET | /waitlist | Get waitlist | Jegatheesan |
| POST | /waitlist | Add to waitlist | Jegatheesan |
| POST | /orders | Place order | Jegatheesan |
| GET | /orders/history | Get order history | Jegatheesan |
| PATCH | /orders/{id}/status | Update order status | Jegatheesan |
| GET | /kitchen/queue | Get kitchen queue | Jegatheesan |
| PUT | /kitchen/queue/{id} | Update prep status | Jegatheesan |
| GET | /inventory | Get inventory | Jegatheesan |
| PUT | /inventory/{id} | Update inventory | Jegatheesan |
| GET | /dashboard | Dashboard data | Jegatheesan |
| GET | /incidents | Get incidents | Navin |
| GET | /recommendations | Get AI recommendations | Navin |
| GET | /analytics | Get analytics | Jegatheesan |
| GET | /healthscore | Get health score | Navin |
| GET | /bills/{id} | Get bill | Jegatheesan |
| GET | /bills/order/{orderId} | Get bill by order | Jegatheesan |
| POST | /bills | Generate bill | Jegatheesan |
| GET | /staff | Get staff list | Jegatheesan |
| PUT | /staff/{id} | Update staff | Jegatheesan |
| PUT | /thresholds | Configure thresholds | Navin |
| PUT | /tables/{id}/status | Update table status | Jegatheesan |
| GET | /notifications | Get notifications | Gokul |
