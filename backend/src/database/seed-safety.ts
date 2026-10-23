const LOCAL_MONGODB_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mongodb"]);

export interface SeedTargetOptions {
  /** Explicit opt-in (`--allow-remote` or SEED_ALLOW_REMOTE=1) to seed a non-local host. */
  allowRemote?: boolean;
  /** Must equal the database name in MONGODB_URI when seeding a remote host. */
  confirmDatabase?: string;
  /** Required for a remote target so the committed demo password is never used there. */
  demoPassword?: string;
}

/** The database name from the URI path (the driver's default database). */
export function databaseNameFromUri(uri: string): string {
  try {
    return decodeURIComponent(new URL(uri).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

/**
 * Refuse demo seeding in production, and against a remote MongoDB host unless the
 * operator opts in and confirms the exact database name.
 */
export function requireSeedTarget(
  nodeEnvironment: string | undefined,
  uri: string | undefined,
  options: SeedTargetOptions = {},
): string {
  if (nodeEnvironment !== "development") {
    throw new Error("Demo data may only be seeded when NODE_ENV=development.");
  }
  if (!uri) throw new Error("MONGODB_URI must be configured for the local MongoDB instance.");

  let hostname: string;
  try {
    hostname = new URL(uri).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB connection URI.");
  }

  if (LOCAL_MONGODB_HOSTS.has(hostname)) return uri;

  if (!options.allowRemote) {
    throw new Error(
      "The seed command is restricted to a local MongoDB host. Pass --allow-remote (or SEED_ALLOW_REMOTE=1) together with --confirm <database> to seed a remote demo database.",
    );
  }
  const databaseName = databaseNameFromUri(uri);
  if (!databaseName) {
    throw new Error("A remote MONGODB_URI must name its database, e.g. ...mongodb.net/andhrimnir.");
  }
  if (options.confirmDatabase !== databaseName) {
    throw new Error(
      `Seeding a remote host needs --confirm ${databaseName} (or SEED_CONFIRM_DATABASE) to match the database in MONGODB_URI.`,
    );
  }
  if (!options.demoPassword) {
    throw new Error("Set SEED_DEMO_PASSWORD before seeding a remote database.");
  }
  return uri;
}

/** Backwards-compatible local-only form. */
export function requireLocalSeedTarget(
  nodeEnvironment: string | undefined,
  uri: string | undefined,
): string {
  return requireSeedTarget(nodeEnvironment, uri);
}

/** Reads `--flag`, `--flag value` and `--flag=value` from argv. */
export function readCliOption(argv: readonly string[], name: string): string | boolean | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === `--${name}`) {
      const next = argv[index + 1];
      return next && !next.startsWith("--") ? next : true;
    }
    if (argument.startsWith(`--${name}=`)) return argument.slice(name.length + 3);
  }
  return undefined;
}
