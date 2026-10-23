import "dotenv/config";
import { AuthError, hashPassword } from "../auth/auth.service.js";
import { closeDatabase, connectToDatabase } from "../database.js";
import { initializeDatabaseSchema } from "./schema.js";
import { DEMO_PASSWORD, seedDevelopmentData } from "./seed-data.js";
import { readCliOption, requireSeedTarget } from "./seed-safety.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const confirm = readCliOption(argv, "confirm");
  const uri = requireSeedTarget(process.env.NODE_ENV, process.env.MONGODB_URI, {
    allowRemote:
      readCliOption(argv, "allow-remote") === true || process.env.SEED_ALLOW_REMOTE === "1",
    confirmDatabase:
      typeof confirm === "string" ? confirm : process.env.SEED_CONFIRM_DATABASE?.trim(),
    demoPassword: process.env.SEED_DEMO_PASSWORD,
  });
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
      "Demo data is ready. Use the Saffron & Co. demo accounts shown in the backend README.\n",
    );
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  const reason =
    error instanceof Error && !/mongodb(\+srv)?:\/\//.test(error.message) ? error.message : "";
  process.stderr.write(
    `Demo seed failed.${reason ? ` ${reason}` : " Check that MongoDB is reachable and the development settings are correct."}\n`,
  );
  process.exitCode = 1;
});
