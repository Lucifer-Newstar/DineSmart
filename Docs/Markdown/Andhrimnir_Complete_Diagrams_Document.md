# Andhrimnir Complete Diagrams Document

Andhrimnir - Complete Architecture & Design Diagrams

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
Pay Bill: 5: Customer
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
participant Service
participant AI
Customer->>Frontend: Place Order
Frontend->>API: POST /orders
API->>Service: Create Order
Service->>AI: Analyze
AI-->>Frontend: Response
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

O --> PAY[Payment & Billing]

PAY --> U

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

```mermaid
flowchart TB
Users-->CDN
CDN-->Frontend
Frontend-->LoadBalancer
LoadBalancer-->API
API-->Mongo
API-->Gemini
API-->Redis
```
