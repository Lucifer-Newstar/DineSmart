import type { IncidentRecord } from "../incident-data";
import type { Recommendation } from "../recommendation-data";
import type { IconName, InventoryItem, Order, Reservation, Section } from "./types";

export const INCIDENT_INVENTORY_ID = "71000000000000000000001d";
export const API_BASE = "/api/v1";

export const NAVIGATION: Array<{ label: Section; icon: IconName; group: "main" | "manage" }> = [
  { label: "Overview", icon: "overview", group: "main" },
  { label: "Orders", icon: "orders", group: "main" },
  { label: "Kitchen", icon: "kitchen", group: "main" },
  { label: "Reservations", icon: "reservations", group: "main" },
  { label: "Inventory", icon: "inventory", group: "manage" },
  { label: "Menu", icon: "menu", group: "manage" },
  { label: "Incidents", icon: "incidents", group: "manage" },
  { label: "Insights", icon: "insights", group: "manage" },
  { label: "Analytics", icon: "analytics", group: "manage" },
  { label: "Settings", icon: "settings", group: "manage" },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: "DS-1042",
    guest: "Aarav Menon",
    table: "Table 04",
    items: "Podi ghee dosa × 2, filter coffee",
    placed: "6:18 pm",
    elapsed: 23,
    status: "Preparing",
  },
  {
    id: "DS-1043",
    guest: "Isha Krishnan",
    table: "Table 08",
    items: "Paneer tikka, lemon rice",
    placed: "6:27 pm",
    elapsed: 14,
    status: "Ready",
  },
  {
    id: "DS-1044",
    guest: "Takeaway · pickup 6:55",
    table: "Pickup",
    items: "Masala dosa × 1, filter coffee × 2",
    placed: "6:38 pm",
    elapsed: 3,
    status: "New",
  },
  {
    id: "DS-1045",
    guest: "Meera Raman",
    table: "Table 03",
    items: "Curd rice, crispy okra",
    placed: "6:32 pm",
    elapsed: 9,
    status: "Preparing",
  },
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    name: "Fresh paneer",
    category: "Dairy & chilled",
    onHand: 3,
    minimum: 8,
    target: 24,
    unit: "kg",
  },
  {
    name: "Filter coffee blend",
    category: "Pantry",
    onHand: 18,
    minimum: 10,
    target: 30,
    unit: "bags",
  },
  { name: "Cold-pressed oil", category: "Pantry", onHand: 7, minimum: 6, target: 20, unit: "L" },
  {
    name: "Baby spinach",
    category: "Fresh produce",
    onHand: 5,
    minimum: 8,
    target: 18,
    unit: "kg",
  },
];

export const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: "RS-209",
    guest: "Priya Shah",
    time: "7:00 pm",
    party: 4,
    table: "Table 02",
    status: "Confirmed",
  },
  {
    id: "RS-210",
    guest: "Nikhil Iyer",
    time: "7:15 pm",
    party: 2,
    table: "Table 06",
    status: "Awaiting",
  },
  {
    id: "RS-211",
    guest: "Ananya Rao",
    time: "7:30 pm",
    party: 6,
    table: "Table 09",
    status: "Confirmed",
  },
  {
    id: "RS-212",
    guest: "Kabir Das",
    time: "8:00 pm",
    party: 3,
    table: "Table 05",
    status: "Confirmed",
  },
];

export const DEMO_RECOMMENDATION: Recommendation = {
  incidentId: INCIDENT_INVENTORY_ID,
  summary: "Fresh paneer is projected to run short before the dinner rush ends.",
  rootCause:
    "Current stock is below the eight-kilogram reorder point while paneer orders are trending above the evening average.",
  priority: "critical",
  source: "demo",
  confidence: 0.91,
  actions: [
    {
      description: "Confirm an emergency transfer of 6 kg from the nearby location.",
      rationale: "The transfer covers the forecast gap without changing today's menu.",
      expectedImpact: "Protects roughly 18 expected orders.",
    },
    {
      description:
        "Ask the kitchen to hold the paneer garnish for staff meals until the transfer arrives.",
      rationale: "Preserves guest portions while the replenishment is in transit.",
      expectedImpact: "Adds a small buffer of about 4 servings.",
    },
  ],
};

export const DEMO_INCIDENTS: IncidentRecord[] = [
  {
    id: INCIDENT_INVENTORY_ID,
    type: "inventory_shortage",
    severity: "critical",
    status: "open",
    triggerSnapshot: { available: 2.4, lowStockThreshold: 4, unit: "kg" },
    affectedEntity: { type: "inventory_item", id: "710000000000000000000010" },
    rootCause: "Paneer stock is below the configured reorder threshold.",
    createdAt: "2026-10-10T12:31:00.000Z",
    updatedAt: "2026-10-10T12:31:00.000Z",
    resolvedAt: null,
    resolutionReason: null,
  },
  {
    id: "71000000000000000000001e",
    type: "reservation_conflict",
    severity: "info",
    status: "resolved",
    triggerSnapshot: { partySize: 2, conflictCount: 1, capacity: 4, tableStatus: "reserved" },
    affectedEntity: { type: "reservation", id: "710000000000000000000015" },
    rootCause: "A reservation conflict cleared after the affected table became available.",
    createdAt: "2026-10-10T09:15:00.000Z",
    updatedAt: "2026-10-10T09:24:00.000Z",
    resolvedAt: "2026-10-10T09:24:00.000Z",
    resolutionReason: "condition_cleared",
  },
];
