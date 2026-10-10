# Andhrímnir Demo Strategy and Mock Data Structure

## Andhrímnir – Demo Strategy & Mock Data Structure

Purpose
This document defines the end-to-end hackathon demonstration strategy for the Andhrímnir AI Incident Intelligence Platform. It aligns with the Product Vision, SRS, SDD, Sprint Backlog, Test Plan and VibeAthon judging criteria.

## 1. Demo Objectives

- Demonstrate complete customer and restaurant workflows.
- Show real-time operational monitoring.
- Demonstrate incident detection and AI recommendations.
- Highlight Restaurant Health Score updates.
- Show role-based dashboards and notifications.
- Present a polished, deployable MVP.
## 2. Demo Flow

- Landing Page → Authentication
- Customer Portal → Browse Menu → Reservation → Order
- Restaurant Dashboard receives live updates
- Kitchen Queue updates
- Inventory updates
- Incident Detection Engine creates incidents
- AI Recommendation Engine generates actions
- Manager resolves incidents
- Restaurant Health Score recalculates
- Analytics and Notifications update
## 3. Demo Scenarios

- Scenario 1: Customer Reservation
- Scenario 2: Walk-in Queue
- Scenario 3: Order Lifecycle
- Scenario 4: Kitchen Congestion
- Scenario 5: Inventory Shortage
- Scenario 6: Reservation Conflict
- Scenario 7: Order Delay
- Scenario 8: AI Recommendation & Resolution
- Scenario 9: Health Score Recovery
## 4. Mock Data Structure

- Restaurant
- Users & Roles
- Authentication
- Restaurant Tables
- Menu Categories
- Menu Items
- Reservations
- Wait Queue
- Orders
- Order Items
- Kitchen Queue
- Inventory
- Suppliers
- Staff Schedule
- Notifications
- Incidents
- Incident Context
- AI Recommendations
- Restaurant Health Score
- Analytics
- Billing
- Dashboard Widgets
## 5. Incident Types

- Kitchen Delay
- Order Delay
- Kitchen Congestion
- Inventory Shortage
- Reservation Conflict
- Queue Congestion
- Staff Shortage
- Table Congestion
## 6. Dashboard Widgets

- Today's Revenue
- Orders
- Reservations
- Kitchen Load
- Inventory Status
- Active Incidents
- AI Recommendations
- Restaurant Health Score
- Notifications
- Analytics Summary
## 7. Live Event Pipeline

- Customer Arrives
- Reservation Created
- Table Assigned
- Order Placed
- Kitchen Queue Updated
- Inventory Updated
- Incident Detected
- Context Built
- AI Recommendation Generated
- Manager Action
- Health Score Updated
- Notifications Sent
## 8. Acceptance Criteria for Demo

- Authentication works
- Reservations and orders function correctly
- Dashboard updates in real time
- Incident engine detects operational issues
- AI recommendations are generated
- Health score changes dynamically
- Notifications are delivered
- Application is deployed and documented
## 9. Judging Criteria Coverage

- Functionality – Complete end-to-end workflow
- User Experience – Modern responsive UI
- Innovation – AI Incident Intelligence
- Problem Solving – Proactive operational awareness
- Code Quality – Modular architecture
- Scalability – Cloud-ready design
- Deployment – Publicly hosted application
## 10. Demo Checklist

- Landing Page
- Login
- Customer Portal
- Restaurant Dashboard
- Kitchen View
- Inventory
- Incidents
- AI Panel
- Analytics
- Health Score
- Notifications
- Deployment
- README
- Presentation
## Appendix – Mock Entity Breakdown

| Entity | Structure |
| --- | --- |
| Restaurant | Basic Information, Branch, Hours, Contact, Status |
| Users | Customer, Reception, Kitchen Staff, Manager, Administrator |
| Tables | Number, Capacity, Zone, Status, Assigned Waiter, Reservation, Order |
| Orders | Order ID, Customer, Table, Items, Status, Timeline |
| Inventory | Item, Stock, Threshold, Supplier, Status |
| Incidents | Type, Severity, Trigger, Root Cause, Status |
| Recommendations | Priority, Explanation, Impact, Confidence |
| Analytics | Revenue, Orders, Wait Time, Peak Hours, Trends |
| Health Score | Kitchen, Inventory, Orders, Reservations, Incidents |

The SRS role list above is canonical for the MVP. Owner, Waiter, and Inventory Manager remain user/persona or responsibility labels—not additional MVP roles—until the permission matrix in the implementation-decisions draft is approved.
