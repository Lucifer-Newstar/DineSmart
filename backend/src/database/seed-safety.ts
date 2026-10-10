const LOCAL_MONGODB_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mongodb"]);

/** Refuse demo seeding in production or against a remote MongoDB host. */
export function requireLocalSeedTarget(
  nodeEnvironment: string | undefined,
  uri: string | undefined,
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

  if (!LOCAL_MONGODB_HOSTS.has(hostname)) {
    throw new Error("The seed command is restricted to a local MongoDB host.");
  }
  return uri;
}
