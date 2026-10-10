import { type Db, MongoClient } from "mongodb";

let client: MongoClient | undefined;
let database: Db | undefined;
let connection: Promise<Db> | undefined;

export function createMongoClient(uri = process.env.MONGODB_URI): MongoClient {
  if (!uri) {
    throw new Error("MONGODB_URI must be set before connecting to MongoDB.");
  }

  return new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
}

export function connectToDatabase(uri = process.env.MONGODB_URI): Promise<Db> {
  if (database) {
    return Promise.resolve(database);
  }

  if (connection) {
    return connection;
  }

  const nextClient = createMongoClient(uri);
  client = nextClient;
  connection = nextClient
    .connect()
    .then(() => {
      if (client !== nextClient) {
        throw new Error("MongoDB connection was closed during initialization.");
      }

      database = nextClient.db();
      return database;
    })
    .catch(async (error: unknown) => {
      if (client === nextClient) {
        client = undefined;
        database = undefined;
        connection = undefined;
      }

      await nextClient.close().catch(() => undefined);
      throw error;
    });

  return connection;
}

export async function closeDatabase(): Promise<void> {
  const currentClient = client;
  client = undefined;
  database = undefined;
  connection = undefined;

  if (currentClient) {
    await currentClient.close();
  }
}
