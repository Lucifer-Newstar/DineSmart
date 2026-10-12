import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Db } from "mongodb";
import { createAiRouter } from "./ai/ai.router.js";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiRecommendationProvider,
  GoogleGeminiTextGenerator,
} from "./ai/gemini.provider.js";
import { IncidentContextBuilder } from "./ai/incident-context.builder.js";
import { MongoIncidentContextRepository } from "./ai/incident-context.repository.js";
import { MongoRecommendationRepository } from "./ai/recommendation.repository.js";
import { RecommendationService } from "./ai/recommendation.service.js";
import { MongoAnalyticsRepository } from "./analytics/analytics.repository.js";
import { createAnalyticsRouter } from "./analytics/analytics.router.js";
import { AnalyticsService } from "./analytics/analytics.service.js";
import { MongoAuthRepository } from "./auth/auth.repository.js";
import { createAuthRouter } from "./auth/auth.router.js";
import { AuthConfigurationError, AuthService } from "./auth/auth.service.js";
import { EmailOtpService } from "./auth/email-otp.service.js";
import { GoogleIdTokenVerifier, GoogleOAuthService } from "./auth/google-oauth.service.js";
import { MongoPasswordResetRepository } from "./auth/password-reset.repository.js";
import { PasswordResetService } from "./auth/password-reset.service.js";
import { MongoRegistrationOtpRepository } from "./auth/registration.repository.js";
import { MongoBillRepository } from "./bills/bill.repository.js";
import { createBillRouter } from "./bills/bill.router.js";
import { BillService } from "./bills/bill.service.js";
import { connectToDatabase } from "./database.js";
import { MongoHealthScoreRepository } from "./healthscore/health-score.repository.js";
import { createHealthScoreRouter } from "./healthscore/health-score.router.js";
import { HealthScoreRefreshScheduler } from "./healthscore/health-score.scheduler.js";
import { sendNoStoreApiResponse } from "./http/cache-policy.js";
import { MongoIncidentDetectionRepository } from "./incidents/incident.repository.js";
import { createIncidentRouter } from "./incidents/incident.router.js";
import { IncidentDetectionScheduler } from "./incidents/incident.scheduler.js";
import { IncidentDetectionService } from "./incidents/incident.service.js";
import { MongoInventoryRepository } from "./inventory/inventory.repository.js";
import { createInventoryRouter } from "./inventory/inventory.router.js";
import { InventoryService } from "./inventory/inventory.service.js";
import { MongoMenuRepository } from "./menu/menu.repository.js";
import { createMenuRouter } from "./menu/menu.router.js";
import { MongoNotificationRepository } from "./notifications/notification.repository.js";
import { createNotificationRouter } from "./notifications/notification.router.js";
import { NotificationService } from "./notifications/notification.service.js";
import { createKitchenRouter } from "./orders/kitchen.router.js";
import { MongoOrderRepository } from "./orders/order.repository.js";
import { createOrderRouter } from "./orders/order.router.js";
import { OrderService } from "./orders/order.service.js";
import { createStaffOrderRouter } from "./orders/order.staff.router.js";
import { StaffOrderService } from "./orders/order.staff.service.js";
import { NotificationRealtimeGateway } from "./realtime/notification-realtime.gateway.js";
import { RealtimeHub } from "./realtime/realtime-hub.js";
import { SocketTicketStore } from "./realtime/socket-ticket.store.js";
import { MongoReservationRepository } from "./reservations/reservation.repository.js";
import { createReservationRouter } from "./reservations/reservation.router.js";
import { ReservationService } from "./reservations/reservation.service.js";
import { MongoStaffRepository } from "./staff/staff.repository.js";
import { createStaffRouter } from "./staff/staff.router.js";
import { StaffService } from "./staff/staff.service.js";
import { MongoTableStatusRepository } from "./tables/table-status.repository.js";
import { createTableStatusRouter } from "./tables/table-status.router.js";
import { TableStatusService } from "./tables/table-status.service.js";
import { MongoWaitlistRepository } from "./waitlist/waitlist.repository.js";
import { createWaitlistRouter } from "./waitlist/waitlist.router.js";
import { WaitlistService } from "./waitlist/waitlist.service.js";

export interface AppOptions {
  getDatabase?: () => Promise<Db>;
  getJwtSecret?: () => string | undefined;
  getGoogleClientId?: () => string | undefined;
  webOrigin?: string;
  nodeEnvironment?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const realtimeHub = new RealtimeHub({
    onError: () => console.error("A real-time event could not be sent."),
  });
  app.locals.realtimeHub = realtimeHub;
  const healthScoreRefreshScheduler = new HealthScoreRefreshScheduler(
    async () =>
      new MongoHealthScoreRepository(await (options.getDatabase?.() ?? connectToDatabase())),
    {
      onError: () => console.error("A background health-score refresh failed."),
      onRefreshed: (restaurantId, result) =>
        realtimeHub.publishRestaurantEvent({
          restaurantId,
          event: "healthscore.updated",
          data: { score: result.score, calculatedAt: result.calculatedAt },
        }),
    },
  );
  app.locals.healthScoreRefreshScheduler = healthScoreRefreshScheduler;
  const incidentDetectionScheduler = new IncidentDetectionScheduler(
    async () => {
      const db = await (options.getDatabase?.() ?? connectToDatabase());
      return new IncidentDetectionService(
        new MongoIncidentDetectionRepository(db),
        undefined,
        healthScoreRefreshScheduler.notifyOperationalEvent,
        realtimeHub.publishRestaurantEvent,
      );
    },
    { onError: () => console.error("A background incident-detection evaluation failed.") },
  );
  app.locals.incidentDetectionScheduler = incidentDetectionScheduler;
  const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV ?? "development";
  const configuredWebOrigin = options.webOrigin ?? process.env.WEB_ORIGIN;
  const webOrigin =
    configuredWebOrigin ?? (nodeEnvironment === "production" ? "" : "http://localhost:3000");
  const googleClientId = options.getGoogleClientId?.() ?? process.env.GOOGLE_CLIENT_ID;
  const googleVerifier = googleClientId ? new GoogleIdTokenVerifier(googleClientId) : undefined;

  if (configuredWebOrigin) {
    const parsedOrigin = new URL(configuredWebOrigin);
    if (
      parsedOrigin.origin !== configuredWebOrigin ||
      !["http:", "https:"].includes(parsedOrigin.protocol)
    ) {
      throw new Error("WEB_ORIGIN must be a canonical HTTP(S) origin without a path.");
    }
  }

  const socketTicketStore = new SocketTicketStore();
  const notificationRealtimeGateway = new NotificationRealtimeGateway({
    allowedOrigin: webOrigin,
    ticketStore: socketTicketStore,
    hub: realtimeHub,
    markDelivered: async (scope, notificationId, deliveredAt) => {
      const db = await (options.getDatabase?.() ?? connectToDatabase());
      return new MongoNotificationRepository(db).markDelivered(scope, notificationId, deliveredAt);
    },
    onError: () => console.error("A notification acknowledgement could not be persisted."),
  });
  app.locals.notificationRealtimeGateway = notificationRealtimeGateway;

  async function createAuthRuntime() {
    const secret = options.getJwtSecret?.() ?? process.env.JWT_SECRET;
    if (!secret) throw new AuthConfigurationError();
    if (nodeEnvironment === "production" && !configuredWebOrigin) {
      throw new AuthConfigurationError("WEB_ORIGIN must be configured in production.");
    }

    const db = await (options.getDatabase?.() ?? connectToDatabase());
    const repository = new MongoAuthRepository(db);
    return { db, repository, secret, service: new AuthService(repository, secret) };
  }

  app.disable("x-powered-by");
  if (nodeEnvironment === "production") app.set("trust proxy", 1);

  app.use(
    cors({
      origin: webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  // Every API response is private by default; routers opt out explicitly.
  app.use("/api/v1", sendNoStoreApiResponse);

  // Infrastructure liveness only; this must not depend on database/auth readiness.
  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(
    "/api/v1/auth",
    createAuthRouter({
      webOrigin,
      nodeEnvironment,
      createService: async () => (await createAuthRuntime()).service,
      createEmailOtpService: async () => {
        const { db, secret, service } = await createAuthRuntime();
        const emailProvider =
          process.env.EMAIL_PROVIDER ?? (nodeEnvironment === "production" ? "" : "mock");
        return new EmailOtpService(
          new MongoRegistrationOtpRepository(db),
          service,
          secret,
          emailProvider,
          nodeEnvironment,
        );
      },
      createPasswordResetService: async () => {
        const { db, secret } = await createAuthRuntime();
        const emailProvider =
          process.env.EMAIL_PROVIDER ?? (nodeEnvironment === "production" ? "" : "mock");
        return new PasswordResetService(
          new MongoPasswordResetRepository(db),
          secret,
          emailProvider,
          nodeEnvironment,
        );
      },
      googleSession: async (idToken) => {
        if (!googleClientId || !googleVerifier) {
          throw new AuthConfigurationError(
            "GOOGLE_CLIENT_ID must be configured for Google sign-in.",
          );
        }

        const { repository, service } = await createAuthRuntime();
        return new GoogleOAuthService(repository, service, googleVerifier).login(idToken);
      },
    }),
  );

  app.use(
    "/api/v1/analytics",
    createAnalyticsRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new AnalyticsService(new MongoAnalyticsRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/healthscore",
    createHealthScoreRouter({
      createRuntime: async () => {
        const { service: authService } = await createAuthRuntime();
        return {
          service: healthScoreRefreshScheduler,
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/inventory",
    createInventoryRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new InventoryService(
            new MongoInventoryRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new NotificationService(
            new MongoNotificationRepository(db),
            undefined,
            realtimeHub.publishNotification,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
          issueSocketTicket: (identity) => socketTicketStore.issue(identity),
        };
      },
      webOrigin,
    }),
  );

  app.use(
    "/api/v1/menu",
    createMenuRouter({
      createReader: async () =>
        new MongoMenuRepository(await (options.getDatabase?.() ?? connectToDatabase())),
    }),
  );

  app.use(
    "/api/v1/reservations",
    createReservationRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new ReservationService(
            new MongoReservationRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/bills",
    createBillRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new BillService(new MongoBillRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/staff",
    createStaffRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new StaffService(new MongoStaffRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/waitlist",
    createWaitlistRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new WaitlistService(
            new MongoWaitlistRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/tables",
    createTableStatusRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new TableStatusService(
            new MongoTableStatusRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/orders",
    createStaffOrderRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new StaffOrderService(
            new MongoOrderRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/orders",
    createOrderRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new OrderService(
            new MongoOrderRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/kitchen",
    createKitchenRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new StaffOrderService(
            new MongoOrderRepository(db),
            undefined,
            healthScoreRefreshScheduler.notifyOperationalEvent,
            incidentDetectionScheduler.notifyOperationalEvent,
            realtimeHub.publishRestaurantEvent,
          ),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/incidents",
    createIncidentRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new IncidentDetectionService(new MongoIncidentDetectionRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1",
    createAiRouter({
      createAuthService: async () => (await createAuthRuntime()).service,
      createRecommendationService: async () => {
        const db = await (options.getDatabase?.() ?? connectToDatabase());
        const contextBuilder = new IncidentContextBuilder(new MongoIncidentContextRepository(db));
        const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        const provider = apiKey
          ? new GeminiRecommendationProvider(new GoogleGeminiTextGenerator(apiKey, model), model)
          : undefined;
        return new RecommendationService(
          contextBuilder,
          new MongoRecommendationRepository(db),
          provider,
          undefined,
          realtimeHub.publishRestaurantEvent,
        );
      },
    }),
  );

  const handleApiError: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const status =
      typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    if (error instanceof SyntaxError || status === 400) {
      response
        .status(400)
        .json({ error: { code: "invalid_request", message: "The request body is invalid." } });
      return;
    }
    if (status === 413) {
      response
        .status(413)
        .json({ error: { code: "payload_too_large", message: "The request body is too large." } });
      return;
    }

    console.error("An unhandled API error occurred.");
    response
      .status(500)
      .json({ error: { code: "internal_error", message: "The request could not be processed." } });
  };
  app.use(handleApiError);

  return app;
}

const app = createApp();
export default app;
