# Andhrímnir Complete Diagrams Document

Andhrímnir - Complete Architecture & Design Diagrams

Mermaid-compatible diagrams for the project.

## System Architecture

```mermaid
flowchart TB
A[Public Website]-->B[Authentication]
B-->C[Customer Portal]
B-->D[Restaurant Portal]
D-->M[Manager]
D-->R[Reception]
D-->K[KDS]
D-->F[Front of House]
C-->CORE
M-->CORE
R-->CORE
K-->CORE
F-->CORE
CORE[Restaurant Operations Core]
CORE-->IE[Incident Detection Engine]
IE-->AI[AI Intelligence]
AI-->DB[(MongoDB)]
AI-->G[Gemini API]
```

## Application Flow

```mermaid
flowchart LR
Landing-->Login
Landing-->Register
Login-->Role{Role}
Role-->Customer
Role-->Restaurant
Customer-->Menu
Customer-->Reservation
Customer-->Orders
Restaurant-->Manager
Restaurant-->Reception
Restaurant-->KDS
Restaurant-->FOH
```

## Data Flow

```mermaid
flowchart LR
Customer-->API
API-->OrderService
OrderService-->Inventory
OrderService-->Kitchen
OrderService-->Billing
Inventory-->Incident
Kitchen-->Incident
Incident-->AI
AI-->Dashboard
Dashboard-->Manager
```

## User Journey

```mermaid
journey
title Andhrimnir User Journey
section Customer
Visit Website: 5: Customer
Browse Menu: 5: Customer
Reserve Table: 4: Customer
Place Order: 5: Customer
View Bill: 5: Customer
section Reception
Receive Reservation: 5: Reception
Assign Table: 5: Reception
Notify Customer: 4: Reception
section Kitchen
Receive Order: 5: Kitchen
Prepare Food: 5: Kitchen
Mark Ready: 5: Kitchen
section Manager
View Dashboard: 5: Manager
Review Incident: 5: Manager
```

## ER Diagram

```mermaid
erDiagram
RESTAURANT ||--o{ USER : employs
CUSTOMER ||--o{ ORDER : places
CUSTOMER ||--o{ RESERVATION : books
ORDER ||--|{ ORDER_ITEM : contains
MENU_ITEM ||--o{ ORDER_ITEM : includes
ORDER ||--|| BILL : generates
```

## Deployment

```mermaid
flowchart TB
User-->Vercel
Vercel-->Render
Render-->Mongo[(MongoDB Atlas)]
Render-->Gemini
Render-->OAuth
```

## Incident Detection

```mermaid
flowchart TD
Event-->Rules
Rules-->Decision{Incident?}
Decision--No-->Monitor
Decision--Yes-->Context
Context-->AI
AI-->Recommendation
Recommendation-->Manager
```

## Sequence

```mermaid
sequenceDiagram
actor Customer
participant Frontend
participant API
participant OrderService
participant MongoDB
Customer->>Frontend: Choose live menu items and quantities
Frontend->>API: POST /api/v1/orders
API->>OrderService: Validate customer, restaurant, and cart
OrderService->>MongoDB: Recheck availability and authoritative prices
OrderService->>MongoDB: Insert item snapshots, then visible order header
MongoDB-->>OrderService: Persisted order with server-calculated subtotal
OrderService-->>API: Order status Created
API-->>Frontend: 201 { order }
Frontend-->>Customer: Show order request; payment/acceptance pending
```

## Component

```mermaid
flowchart TB
Client-->Auth
Client-->CustomerPortal
Client-->RestaurantPortal
RestaurantPortal-->IncidentEngine
IncidentEngine-->AIService
AIService-->Gemini
CustomerPortal-->Mongo[(MongoDB)]
```

## State

```mermaid
stateDiagram-v2
[*]-->Created
Created-->Accepted
Accepted-->Preparing
Preparing-->Ready
Ready-->Served
Served-->Completed
Completed-->[*]
```

## Reservation Lifecycle

The statuses a booking moves through (S5-01). Staff drive every transition except the guest's own cancellation, which closes at the restaurant's change cutoff. Seating needs a table; a no-show can only be recorded after the grace period. Confirmations, staff changes and cancellations notify the guest (S5-04).

```mermaid
stateDiagram-v2
    [*] --> Awaiting: guest books online
    [*] --> Confirmed: staff books with a table
    Awaiting --> Confirmed: staff confirms
    Awaiting --> Arrived: staff marks arrival
    Confirmed --> Arrived: staff marks arrival
    Confirmed --> Seated: staff seats at a table
    Arrived --> Seated: staff seats at a table
    Seated --> Completed: visit ends, table freed
    Awaiting --> Cancelled: guest (before cutoff) or staff
    Confirmed --> Cancelled: guest (before cutoff) or staff
    Arrived --> Cancelled: staff
    Confirmed --> NoShow: staff, after the grace period
    Completed --> [*]
    Cancelled --> [*]
    NoShow --> [*]
```

## Activity

```mermaid
flowchart TD

A([Start])

A --> B[User Opens Application]

B --> C{Authenticated?}

C -- No --> D[Login / Register]

D --> E[Authenticate via Email OTP or Google OAuth]

E --> F{Authentication Successful?}

F -- No --> D

F -- Yes --> G

C -- Yes --> G{User Role}

%% Customer Flow

G -->|Customer| H[Browse Digital Menu]

H --> I[Check Live Item Availability]

I --> J[Reserve Table or Place Order]

J --> K[Order Created]

K --> L[Kitchen Receives Order]

L --> INV[Update Inventory]

INV --> M[Prepare Food]

M --> N[Update Order Status]

N --> O[Customer Receives Notification]

O --> BILL[Generate/View Bill]

BILL --> U

%% Reception Flow

G -->|Reception| R1[Manage Reservations]

R1 --> R2[Assign Table]

R2 --> CHECK_TABLE{Table Conflict?}

CHECK_TABLE -- No --> U

CHECK_TABLE -- Yes --> Q

%% Kitchen Staff Flow

G -->|Kitchen Staff| K1[View Kitchen Queue]

K1 --> K2[Update Preparation Status]

K2 --> N

%% Manager Flow

G -->|Manager| M1[View Operational Dashboard]

M1 --> U

%% Operational Data Collection (Trigger Points)

N --> OPS[Collect Operational Signals]

R2 --> OPS

INV --> OPS

K2 --> OPS

PAY --> OPS

OPS --> S[Incident Detection Engine]

S --> T{Incident Detected?}

T -- No --> U

T -- Yes --> W[Build Operational Context]

W --> X[Send Context to Gemini AI]

X --> GEMINI{AI Available?}

GEMINI -- No --> FALLBACK[Use Static Recommendation Fallback]

FALLBACK --> Z

GEMINI -- Yes --> Y[Generate AI Recommendation]

Y --> Z[Store Incident & Recommendation]

Z --> AA[Notify Manager]

AA --> AB[Manager Reviews Recommendation]

AB --> AC{Take Action?}

AC -- Yes --> AD[Resolve Operational Issue]

AD --> NOTIFY_CUSTOMER[Notify Affected Customers]

NOTIFY_CUSTOMER --> AE[Update Restaurant Health Score]

AE --> U

AC -- No --> AF[Keep Incident Open]

AF --> U

AC -- Defer --> AG[Log Incident for Later Review]

AG --> U

%% Dashboard Update - Common End Point

U[Update Dashboard with Latest Data]

U --> V([End])
```

## Security Flow

```mermaid
flowchart LR
User-->Login
Login-->OAuth
Login-->OTP
OAuth-->JWT
OTP-->JWT
JWT-->RBAC
RBAC-->Portal
Portal-->API
API-->DB
```

## Scalability

The planned deployment is one Next.js app on Vercel and one API instance on Render, with MongoDB Atlas and the Gemini API. The browser opens the WebSocket to the API directly. Dashed items are possible future additions and do not exist in the code: rate-limit counters and the realtime hub are in-process today, so a second API instance would need a shared store (for example Redis) first.

```mermaid
flowchart TB
Users-->Vercel["Vercel (Next.js frontend + /api rewrite)"]
Vercel-->API["Render (Express API, single instance)"]
Users-. "WebSocket" .->API
API-->Mongo["MongoDB Atlas"]
API-->Gemini["Gemini API"]
API-->Email["SMTP or Resend"]
API-.->Redis["Redis (future: shared rate limits and realtime fan-out)"]
LB["Extra API instances behind a load balancer (future)"]-.->API
```
