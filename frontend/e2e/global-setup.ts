import { execFileSync } from "node:child_process";
import path from "node:path";
import { E2E_MONGODB_URI } from "../playwright.config";

/**
 * Seeds the demo restaurant before the suite runs. The seed CLI upserts its
 * fixed fixture IDs, so every run starts from the same Saffron & Co. records.
 * It refuses remote databases, which keeps the suite on a local MongoDB.
 */
export default function globalSetup(): void {
  const backend = path.resolve(import.meta.dirname, "..", "..", "backend");
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

/** The password every seeded demo account gets for the e2e run. */
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "Andhrimnir E2E 2026";
