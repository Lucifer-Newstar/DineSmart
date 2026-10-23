import "dotenv/config";
import { ObjectId } from "mongodb";
import { hashPassword } from "../auth/auth.service.js";
import { closeDatabase, connectToDatabase } from "../database.js";
import {
  addStaffAccount,
  BootstrapError,
  bootstrapRestaurant,
  parseStaffRole,
} from "./bootstrap.js";
import { initializeDatabaseSchema } from "./schema.js";
import { readCliOption } from "./seed-safety.js";

const USAGE = `Usage:
  npm run bootstrap -- --restaurant "Name" --name "Admin Name" --email admin@example.com
      [--role Administrator] [--timezone Asia/Kolkata] [--currency INR]
  npm run bootstrap -- --restaurant-id <id> --name "Staff Name" --email staff@example.com
      --role "Kitchen Staff"

The account password is read from BOOTSTRAP_PASSWORD (at least 12 characters), never
from the command line. MONGODB_URI selects the database.`;

function option(argv: readonly string[], name: string): string | undefined {
  const value = readCliOption(argv, name);
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (readCliOption(argv, "help")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new BootstrapError("MONGODB_URI must be set.");
  const password = process.env.BOOTSTRAP_PASSWORD ?? "";
  if (Array.from(password).length < 12 || Buffer.byteLength(password, "utf8") > 1_024) {
    throw new BootstrapError("BOOTSTRAP_PASSWORD must be 12 characters to 1024 bytes.");
  }

  const restaurantName = option(argv, "restaurant");
  const restaurantId = option(argv, "restaurant-id");
  if (Boolean(restaurantName) === Boolean(restaurantId)) {
    throw new BootstrapError(`Pass exactly one of --restaurant or --restaurant-id.\n\n${USAGE}`);
  }
  if (restaurantId && !ObjectId.isValid(restaurantId)) {
    throw new BootstrapError("--restaurant-id must be a 24-character hex ObjectId.");
  }
  const account = {
    name: option(argv, "name") ?? "",
    email: option(argv, "email") ?? "",
    role: parseStaffRole(option(argv, "role") ?? (restaurantName ? "Administrator" : "")),
    passwordHash: await hashPassword(password),
  };

  try {
    const db = await connectToDatabase(uri);
    await initializeDatabaseSchema(db);
    if (restaurantName) {
      const { restaurant, admin } = await bootstrapRestaurant(
        db,
        {
          name: restaurantName,
          timezone: option(argv, "timezone"),
          currency: option(argv, "currency"),
        },
        account,
      );
      process.stdout.write(
        `Created restaurant "${restaurant.name}" (${restaurant._id.toHexString()}) and ${admin.role} ${admin.email}.\nSet NEXT_PUBLIC_DEMO_RESTAURANT_ID=${restaurant._id.toHexString()} on the frontend to use it for the customer pages.\n`,
      );
    } else {
      const user = await addStaffAccount(db, new ObjectId(restaurantId), account);
      process.stdout.write(`Added ${user.role} ${user.email}.\n`);
    }
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof BootstrapError
      ? error.message
      : "Bootstrap failed. Check that MONGODB_URI is reachable.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
