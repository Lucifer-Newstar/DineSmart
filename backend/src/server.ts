import "dotenv/config";
import type { Db } from "mongodb";
import { createApp } from "./app.js";
import { initializeDatabaseSchema } from "./database/schema.js";
import { closeDatabase, connectToDatabase } from "./database.js";
import { assertEmailConfiguration, EmailConfigurationError } from "./email/email-transport.js";
import type { HealthScoreRefreshScheduler } from "./healthscore/health-score.scheduler.js";
import type { IncidentDetectionScheduler } from "./incidents/incident.scheduler.js";
import type { ReminderScheduler } from "./notifications/reminder.scheduler.js";
import type { NotificationRealtimeGateway } from "./realtime/notification-realtime.gateway.js";

const port = Number(process.env.PORT ?? 3001);
const nodeEnvironment = process.env.NODE_ENV ?? "development";

try {
  assertEmailConfiguration(process.env, nodeEnvironment);
} catch (error) {
  if (error instanceof EmailConfigurationError) {
    console.error(`Email is not configured: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

let schemaReady: Promise<Db> | undefined;
function getSchemaReadyDatabase(): Promise<Db> {
  if (!process.env.MONGODB_URI) {
    return Promise.reject(new Error("MONGODB_URI is not configured."));
  }

  if (!schemaReady) {
    schemaReady = connectToDatabase()
      .then(async (database) => {
        await initializeDatabaseSchema(database);
        return database;
      })
      .catch((error: unknown) => {
        schemaReady = undefined;
        throw error;
      });
  }

  return schemaReady;
}

const app = createApp({ getDatabase: getSchemaReadyDatabase });
const healthScoreRefreshScheduler = app.locals
  .healthScoreRefreshScheduler as HealthScoreRefreshScheduler;
const incidentDetectionScheduler = app.locals
  .incidentDetectionScheduler as IncidentDetectionScheduler;
const reminderScheduler = app.locals.reminderScheduler as ReminderScheduler;
const notificationRealtimeGateway = app.locals
  .notificationRealtimeGateway as NotificationRealtimeGateway;
const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Andhrímnir API server listening on port ${port}.`);
});
notificationRealtimeGateway.attach(server);

const DATABASE_RETRY_MS = 60_000;
let databaseRetryTimer: NodeJS.Timeout | undefined;

/**
 * Starts the hourly schedulers once MongoDB is reachable. A failed first connect
 * (for example a cold start before Atlas answers) is retried every minute, so the
 * background jobs do not stay off until the next restart.
 */
function startBackgroundJobs(): void {
  databaseRetryTimer = undefined;
  void getSchemaReadyDatabase()
    .then(() => {
      console.info("Connected to MongoDB; schema indexes are ready.");
      void healthScoreRefreshScheduler.startHourlyRefresh().catch(() => {
        console.error(
          "The initial health-score refresh failed; the hourly retry remains scheduled.",
        );
      });
      void incidentDetectionScheduler.startHourlyRefresh().catch(() => {
        console.error(
          "The initial incident-detection sweep failed; the hourly retry remains scheduled.",
        );
      });
      void reminderScheduler.start().catch(() => {
        console.error("The first booking-reminder pass failed; the next one runs in 15 minutes.");
      });
    })
    .catch(() => {
      console.error(
        "MongoDB connection or schema initialization failed; retrying in 60 seconds. The API stays in liveness-only mode until then.",
      );
      databaseRetryTimer = setTimeout(startBackgroundJobs, DATABASE_RETRY_MS);
      databaseRetryTimer.unref();
    });
}

if (process.env.MONGODB_URI) {
  startBackgroundJobs();
} else {
  console.info("MONGODB_URI is unset; database connection skipped.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (databaseRetryTimer) clearTimeout(databaseRetryTimer);
    healthScoreRefreshScheduler.stopHourlyRefresh();
    incidentDetectionScheduler.stopHourlyRefresh();
    reminderScheduler.stop();
    notificationRealtimeGateway.close();
    server.close((error) => {
      if (error) {
        console.error("The API server did not shut down cleanly.", error);
        process.exitCode = 1;
      }

      void closeDatabase().catch(() => {
        console.error("The MongoDB client did not shut down cleanly.");
        process.exitCode = 1;
      });
    });
  });
}
