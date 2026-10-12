import type { ObjectId } from "mongodb";
import { COLLECTIONS } from "./schema.js";
import { buildDemoSeedData, type DemoSeedData } from "./seed-data.js";

/**
 * The summary builds the in-memory fixture set only to describe it. The
 * placeholder hash is never a credential: no password, hash, or secret is
 * printed, and nothing is written to a database.
 */
const SUMMARY_PLACEHOLDER_HASH = "demo-fixture-summary-placeholder";

/** Collection name to fixture-key mapping, mirroring the seed module. */
const FIXTURE_COLLECTIONS: ReadonlyArray<readonly [string, keyof DemoSeedData]> = [
  [COLLECTIONS.restaurants, "restaurants"],
  [COLLECTIONS.users, "users"],
  [COLLECTIONS.customers, "customers"],
  [COLLECTIONS.staff, "staff"],
  [COLLECTIONS.menuItems, "menuItems"],
  [COLLECTIONS.tables, "tables"],
  [COLLECTIONS.inventoryItems, "inventoryItems"],
  [COLLECTIONS.reservations, "reservations"],
  [COLLECTIONS.waitlist, "waitlist"],
  [COLLECTIONS.orders, "orders"],
  [COLLECTIONS.orderItems, "orderItems"],
  [COLLECTIONS.incidents, "incidents"],
  [COLLECTIONS.recommendations, "recommendations"],
  [COLLECTIONS.notifications, "notifications"],
  [COLLECTIONS.bills, "bills"],
];

export interface DemoAccountSummary {
  email: string;
  role: string;
  name: string;
}

export interface DemoIncidentSummary {
  id: string;
  type: string;
  severity: string;
  status: string;
}

export interface DemoRecommendationSummary {
  id: string;
  incidentId: string;
  priority: string;
  source: string;
  actionCount: number;
}

export interface DemoFixtureSummary {
  restaurant: { id: string; name: string; currency: string; timezone: string };
  accounts: DemoAccountSummary[];
  counts: Array<{ collection: string; count: number }>;
  incidents: DemoIncidentSummary[];
  recommendations: DemoRecommendationSummary[];
  totalRecords: number;
}

function hex(value: ObjectId): string {
  return value.toHexString();
}

export function summarizeDemoFixtures(now = new Date()): DemoFixtureSummary {
  const data = buildDemoSeedData(SUMMARY_PLACEHOLDER_HASH, now);
  const [restaurant] = data.restaurants;

  return {
    restaurant: {
      id: hex(restaurant._id),
      name: restaurant.name,
      currency: restaurant.currency,
      timezone: restaurant.timezone,
    },
    accounts: data.users.map((user) => ({
      email: user.email,
      role: user.role,
      name: user.name,
    })),
    counts: FIXTURE_COLLECTIONS.map(([collection, key]) => ({
      collection,
      count: data[key].length,
    })),
    incidents: data.incidents.map((incident) => ({
      id: hex(incident._id),
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
    })),
    recommendations: data.recommendations.map((recommendation) => ({
      id: hex(recommendation._id),
      incidentId: hex(recommendation.incidentId),
      priority: recommendation.priority,
      source: recommendation.source,
      actionCount: recommendation.actions.length,
    })),
    totalRecords: FIXTURE_COLLECTIONS.reduce((total, [, key]) => total + data[key].length, 0),
  };
}

export function formatDemoFixtureSummary(summary: DemoFixtureSummary): string {
  const lines: string[] = [];
  lines.push(`Restaurant: ${summary.restaurant.name} (${summary.restaurant.id})`);
  lines.push(
    `Currency ${summary.restaurant.currency} · timezone ${summary.restaurant.timezone} · ${summary.totalRecords} seeded records`,
  );
  lines.push("");
  lines.push("Demo accounts (password from SEED_DEMO_PASSWORD or the documented demo default):");
  for (const account of summary.accounts) {
    lines.push(`  - ${account.role.padEnd(14)} ${account.email.padEnd(34)} ${account.name}`);
  }
  lines.push("");
  lines.push("Seeded collection counts:");
  for (const { collection, count } of summary.counts) {
    lines.push(`  - ${collection.padEnd(20)} ${count}`);
  }
  lines.push("");
  lines.push("Seeded incidents:");
  for (const incident of summary.incidents) {
    lines.push(
      `  - ${incident.id}  ${incident.type.padEnd(22)} ${incident.severity.padEnd(9)} ${incident.status}`,
    );
  }
  lines.push("");
  lines.push("Seeded advisory recommendations:");
  for (const recommendation of summary.recommendations) {
    lines.push(
      `  - ${recommendation.id}  incident ${recommendation.incidentId}  ${recommendation.priority.padEnd(9)} source ${recommendation.source}  ${recommendation.actionCount} action(s)`,
    );
  }
  return lines.join("\n");
}
