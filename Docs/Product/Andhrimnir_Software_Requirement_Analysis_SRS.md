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
- Voice AI Assistant
- Automated Workforce Scheduling
## 10. Requirement Priority (MoSCoW)

| Priority | Requirements |
| --- | --- |
| Must Have | Authentication, Digital Menu, Orders, Reservations, Inventory, Dashboard, Incident Detection, AI Recommendations, Health Score |
| Should Have | Analytics, Notifications, Staff Management, Table Management |
| Could Have | Demand Forecasting, ETA Prediction, Personalized Recommendations |
| Won't Have (MVP) | Multi-branch Support, POS Integrations, IoT Devices, Advanced Predictive ML, Payment Processing, Durable Offline Write Queues/Emergency Offline Mode |
