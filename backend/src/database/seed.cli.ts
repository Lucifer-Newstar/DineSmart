import "dotenv/config";
import { AuthError, hashPassword } from "../auth/auth.service.js";
import { closeDatabase, connectToDatabase } from "../database.js";
import { initializeDatabaseSchema } from "./schema.js";
import { DEMO_PASSWORD, seedDevelopmentData } from "./seed-data.js";
import { requireLocalSeedTarget } from "./seed-safety.js";

async function main(): Promise<void> {
  const uri = requireLocalSeedTarget(process.env.NODE_ENV, process.env.MONGODB_URI);
  const password = process.env.SEED_DEMO_PASSWORD ?? DEMO_PASSWORD;
  if (Buffer.byteLength(password, "utf8") > 1_024 || Array.from(password).length < 12) {
    throw new AuthError(
      400,
      "invalid_demo_password",
      "SEED_DEMO_PASSWORD must be at least 12 characters and at most 1024 bytes.",
    );
  }

  try {
    const db = await connectToDatabase(uri);
    await initializeDatabaseSchema(db);
    const passwordHash = await hashPassword(password);
    await seedDevelopmentData(db, passwordHash);
    process.stdout.write(
      "Local demo data is ready. Use the Saffron & Co. demo accounts shown in the backend README.\n",
    );
  } finally {
    await closeDatabase();
  }
}

main().catch(() => {
  process.stderr.write(
    "Local demo seed failed. Check that the local MongoDB service and development settings are correct.\n",
  );
  process.exitCode = 1;
});
