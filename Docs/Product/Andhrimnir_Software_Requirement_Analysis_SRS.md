# Andhrímnir Software Requirement Analysis SRS

## Software Requirement Analysis (SRS)
Andhrímnir – AI Incident Intelligence Platform for Restaurants

## 1. Business Goal

Develop an intelligent SaaS platform that enables restaurants to monitor operations in real time, detect operational incidents, and provide AI-assisted recommendations that improve efficiency, reduce delays, and enhance customer experience. Unlike traditional POS systems, the platform focuses on operational intelligence rather than transaction processing.

## 2. Stakeholders

Primary Stakeholders

- Restaurant Owner
- Restaurant Manager

Secondary Stakeholders

- Reception Staff
- Kitchen Staff
- Waiters / Front-of-House Staff
- Customers

Technical Stakeholders

- System Administrator
- AI Service
- Database Administrator
## 3. Functional Requirements

FR-1 User Authentication

- Email + OTP registration
- Email & Password login
- Google OAuth login
- Password reset
- Secure logout
- JWT authentication
- Role-Based Access Control with the canonical MVP roles: Customer, Reception, Kitchen Staff, Manager, and Administrator
- Administrator access is restaurant-scoped; Restaurant Owner maps to Manager for MVP. Waiter and Inventory Manager are not separate MVP roles.
- OTP policy: six digits, 10-minute expiry, 60-second resend cooldown, maximum five verification attempts.
- Password hashes use Argon2id. Use a 15-minute access JWT and rotating seven-day refresh session; keep the access token in memory and the refresh token in an HttpOnly/Secure cookie. Logout revokes the refresh session.

FR-2 Customer Portal

- Browse digital menu
- View live item availability
- Reserve tables
- Track reservation status
- Place orders
- Track order progress
- Receive notifications
- View bills and order history

FR-3 Restaurant Dashboard

- View orders
- Monitor reservations
- Track kitchen activity
- Monitor inventory
- View restaurant health score
- Review AI recommendations
- Manage staff
- View analytics
- Configure thresholds

FR-4 Reservation Management

- Create, update and cancel reservations
- Assign tables
- Manage waitlist
- Notify customers
- FR-4.1 Show bookable time slots for a date and party size, computed from tables, turn times by party size and opening hours (S5-01)
- FR-4.2 Cap the covers that may start in any 15-minute window (pacing), and enforce a minimum lead time and a maximum booking window (S5-01)
- FR-4.3 Let customers change or cancel their own booking until the restaurant's change cutoff (S5-01)
- FR-4.4 Record arrival, seating and no-shows, and suggest the best-fit free table when seating (S5-01)
- FR-4.5 Quote walk-in waits from the current floor and turn times (S5-01)
- FR-4.6 Tell the guest, in the app and by email with a calendar file, when staff confirm, change or cancel a booking, and remind them the day before (S5-04)

FR-5 Order Management

- Create, update and cancel orders
- Kitchen routing
- Generate bills
- Order lifecycle: Created → Accepted → Preparing → Ready → Served → Completed
- Generate and retrieve bills; payment capture/provider integration is not part of the MVP.

FR-6 Kitchen Management

- Receive orders
- View preparation queue
- Update preparation status
- Mark food ready
- Notify waiters

FR-7 Inventory Management

- Add and update inventory
- Monitor stock
- Receive shortage alerts
- Track consumption history

FR-8 Incident Detection Engine

- Detect kitchen congestion
- Detect order delays
- Detect inventory shortages
- Detect table congestion
- Detect reservation conflicts
- Detect excessive waiting time
- Detect staff shortages
- Record incident ID, timestamp, severity, root cause, affected module, recommendation and resolution status

FR-9 AI Recommendation Engine

- Analyze incidents
- Generate explainable recommendations
- Prioritize actions
- Provide operational summaries

FR-10 Restaurant Health Score

- Calculate overall health score using kitchen efficiency, inventory health, order completion rate, table utilization, reservation efficiency and incident frequency

FR-11 Analytics Dashboard

- Daily orders
- Revenue
- Wait time
- Preparation time
- Inventory consumption
- Active and resolved incidents
- Peak hours
- Customer trends

FR-12 Notifications

- Customer notifications
- Staff alerts
- Critical manager alerts
- FR-12.1 Tell the customer when their order is ready, and alert Reception staff when a dine-in order is ready to take to the table (S5-04)
- FR-12.2 Let each user turn optional notification categories off; incident alerts stay on (S5-04)
- FR-12.3 Mark all notifications as read (S5-04)
- FR-12.4 Every email has a plain-text part and an HTML part. Email goes through a configurable transport; the development transport sends nothing (S5-04)

FR-13 Guest Profiles and Privacy

- FR-13.1 Keep a guest profile per restaurant with visit count, last visit, no-show count, staff tags and notes, shown beside each booking for staff (S5-02)
- FR-13.2 Let customers update their name and contact preferences, change their password and sign out other devices (S5-02)
- FR-13.3 Let customers download their own data as JSON and delete their account, erasing their personal data (S5-02)
- FR-13.4 Publish a privacy notice describing the data held and the rights offered (S5-02)

FR-14 QR Dine-in Ordering and Live Tracking

- FR-14.1 Issue a signed QR link per table; a tampered or expired link is refused (S5-03)
- FR-14.2 Open the menu in dine-in mode from a table link and attach the table to the order (S5-03)
- FR-14.3 Allow a special request per order line and show it on the kitchen ticket (S5-03)
- FR-14.4 Show an estimated ready time and the order's status live to the customer who placed it; reorder a past order in one tap (S5-03)

FR-15 Installable App and Offline Reading

- FR-15.1 Provide a web app manifest and icons so the app can be installed (S5-05)
- FR-15.2 Show an offline page when a page cannot load without a connection (S5-05)
- FR-15.3 Keep the last loaded menu readable offline, with ordering turned off and a note saying so (S5-05)
- FR-15.4 Show a banner in the workspace while the network or live updates are down (S5-05)
### Traceability for Sprint 5

| Requirement | Task | Evidence |
| --- | --- | --- |
| FR-4.1 to FR-4.5 | S5-01 | Availability, pacing, booking-window, customer-change, waitlist-estimate and booking-rules tests; `reservations.spec.ts`, `customer-booking.spec.ts` |
| FR-4.6, FR-12.1 to FR-12.4 | S5-04 | Reservation-notifier, reminder-scheduler, order-notifier, notification-preferences and email-template tests |
| FR-13.1 to FR-13.4 | S5-02 | Customer-profile, customer-account and password-change tests; `account.spec.ts` |
| FR-14.1 to FR-14.4 | S5-03 | Table-token, order-table, order-ETA and customer-order-event tests; `qr-order.spec.ts` |
| FR-15.1 to FR-15.4 | S5-05 | `offline.spec.ts`; connection-status unit test |

Offline support is limited to reading. Orders, bookings and account changes still need a connection; durable offline write queues remain out of scope (see section 10).

## 4. Non-Functional Requirements

Performance

- Dashboard load under 2 seconds
- Incident detection under 5 seconds
- AI response under 10 seconds
- API latency under 500 ms

Scalability

- Support multiple restaurants
- Support concurrent users
- Modular architecture
- Future multi-branch expansion

Security

- HTTPS
- JWT
- RBAC
- Password hashing
- OTP verification
- Google OAuth
- Secure APIs

Reliability

- High availability
- Graceful error handling
- Automatic retry for AI failures
- Audit logging

Usability

- Responsive interface
- Simple dashboard
- Minimal clicks
- Accessible UI
- Real-time updates
## 5. Data Requirements

- User
- Customer
- Restaurant
- Menu Item
- Order
- Order Item
- Reservation
- Inventory Item
- Table
- Incident
- Recommendation
- Notification
- Bill
## 6. AI Requirements

Inputs

- Orders
- Reservations
- Inventory
- Kitchen queue
- Wait times
- Staff activity

Processing Flow

Rule Engine → Incident Detection → Context Builder → Gemini Analysis → Recommendation → Dashboard

## 7. External Interfaces

- Google OAuth
- Email OTP
- Gemini API
- MongoDB Atlas
- Vercel
- Render
- GitHub
## 8. System Constraints

- Cloud-based deployment
- Internet connectivity required
- Gemini API quota limitations
- MongoDB Atlas free-tier constraints
- Role-based access enforced
- AI recommendations remain advisory
## 9. MVP Scope

Included

- Authentication
- Customer Portal
- Restaurant Dashboard
- Digital Menu
- Reservations
- Orders
- Inventory Monitoring
- Rule-Based Incident Detection
- AI Recommendations
- Restaurant Health Score
- Notifications
- Analytics Dashboard

Deferred

- POS Integrations
- IoT Integration
- Predictive Machine Learning
- Multi-Branch Management
- Enterprise Analytics
- Supplier Management
- Voice AI Team
- Automated Workforce Scheduling
## 10. Requirement Priority (MoSCoW)

| Priority | Requirements |
| --- | --- |
| Must Have | Authentication, Digital Menu, Orders, Reservations, Inventory, Dashboard, Incident Detection, AI Recommendations, Health Score |
| Should Have | Analytics, Notifications, Staff Management, Table Management |
| Could Have | Demand Forecasting, ETA Prediction, Personalized Recommendations |
| Won't Have (MVP) | Multi-branch Support, POS Integrations, IoT Devices, Advanced Predictive ML, Payment Processing, Durable Offline Write Queues/Emergency Offline Mode |
