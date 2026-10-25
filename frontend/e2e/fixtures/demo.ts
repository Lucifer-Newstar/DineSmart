import { execFileSync } from "node:child_process";
import path from "node:path";

/** The seeded Saffron & Co. restaurant (backend/src/database/seed-data.ts). */
export const DEMO_RESTAURANT_ID = "710000000000000000000001";

/** The password global-setup gives every seeded demo account. */
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "Andhrimnir E2E 2026";

export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/andhrimnir_e2e";

export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3001}`;

export type DemoRole = "Customer" | "Reception" | "Kitchen Staff" | "Manager" | "Administrator";

export interface DemoAccount {
  role: DemoRole;
  email: string;
  name: string;
}

export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> = {
  Customer: { role: "Customer", email: "ananya@saffronandco.demo", name: "Ananya Menon" },
  Reception: { role: "Reception", email: "reception@saffronandco.demo", name: "Arjun Iyer" },
  "Kitchen Staff": {
    role: "Kitchen Staff",
    email: "kitchen.staff@saffronandco.demo",
    name: "Meera Das",
  },
  Manager: { role: "Manager", email: "manager@saffronandco.demo", name: "Maya Nair" },
  Administrator: {
    role: "Administrator",
    email: "administrator@saffronandco.demo",
    name: "Devika Rao",
  },
};

/**
 * Runs the backend seed CLI against the e2e database. It upserts fixed fixture
 * IDs, so calling it again restores the demo records a spec changed. The CLI
 * refuses non-local databases.
 */
export function seedDemoData(): void {
  const backend = path.resolve(import.meta.dirname, "..", "..", "..", "backend");
  execFileSync("npx", ["tsx", "src/database/seed.cli.ts"], {
    cwd: backend,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      MONGODB_URI: E2E_MONGODB_URI,
      SEED_DEMO_PASSWORD: DEMO_PASSWORD,
    },
  });
}

/** A unique, valid address for accounts a spec creates. */
export function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}.${stamp}@example.test`;
}
