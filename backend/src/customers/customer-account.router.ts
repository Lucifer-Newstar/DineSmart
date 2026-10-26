import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import {
  AccountError,
  accountProfileToJson,
  type CustomerAccountChanges,
  type CustomerAccountProfile,
  parseAccountChanges,
} from "./customer-account.js";
import type { AccountExport, ErasureSummary } from "./customer-privacy.js";

/** A customer's own account routes (S5-02). Staff accounts are managed elsewhere. */

export interface CustomerAccountStore {
  exportData(userId: ObjectId, now: Date): Promise<AccountExport>;
  eraseAccount(
    userId: ObjectId,
    confirmation: unknown,
    password: unknown,
    now: Date,
  ): Promise<ErasureSummary>;
  getProfile(userId: ObjectId, now: Date): Promise<CustomerAccountProfile>;
  updateProfile(
    userId: ObjectId,
    changes: CustomerAccountChanges,
    now: Date,
  ): Promise<CustomerAccountProfile>;
}

export interface CustomerAccountRuntime {
  store: CustomerAccountStore;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  clock?: () => Date;
}

export interface CustomerAccountRouterOptions {
  createRuntime: () => Promise<CustomerAccountRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "account_unavailable", message: "Your account is temporarily unavailable." },
  });
}

export function sendAccountError(error: unknown, response: Response): void {
  if (error instanceof AccountError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  sendUnavailable(response);
}

export function createCustomerAccountRouter(options: CustomerAccountRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, CustomerAccountRuntime>();

  router.use(async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, () => {
        if (request.auth?.role !== "Customer") {
          response.status(403).json({
            error: {
              code: "customer_account_required",
              message: "These settings are for customer accounts.",
            },
          });
          return;
        }
        next();
      });
    } catch {
      sendUnavailable(response);
    }
  });

  const context = (request: Request) => {
    const runtime = runtimes.get(request);
    const userId = request.auth?.userId;
    if (!runtime || !userId || !ObjectId.isValid(userId)) return null;
    return { runtime, userId: new ObjectId(userId), now: runtime.clock?.() ?? new Date() };
  };

  router.get("/profile", async (request: Request, response: Response) => {
    const current = context(request);
    if (!current) return sendUnavailable(response);
    try {
      const profile = await current.runtime.store.getProfile(current.userId, current.now);
      response.set("Cache-Control", "no-store");
      response.status(200).json({ profile: accountProfileToJson(profile) });
    } catch (error) {
      sendAccountError(error, response);
    }
  });

  router.patch("/profile", async (request: Request, response: Response) => {
    const current = context(request);
    if (!current) return sendUnavailable(response);
    const changes = parseAccountChanges(request.body);
    if (!changes) {
      response.status(400).json({
        error: {
          code: "invalid_account_update",
          message: "Send a name of up to 100 characters and/or email and offers preferences.",
        },
      });
      return;
    }
    try {
      const profile = await current.runtime.store.updateProfile(
        current.userId,
        changes,
        current.now,
      );
      response.status(200).json({ profile: accountProfileToJson(profile) });
    } catch (error) {
      sendAccountError(error, response);
    }
  });

  // Everything the customer gave us or did here, as one JSON download (S5-02).
  router.get("/export", async (request: Request, response: Response) => {
    const current = context(request);
    if (!current) return sendUnavailable(response);
    try {
      const data = await current.runtime.store.exportData(current.userId, current.now);
      response.set("Cache-Control", "no-store");
      response.set(
        "Content-Disposition",
        `attachment; filename="dinesmart-account-${current.now.toISOString().slice(0, 10)}.json"`,
      );
      response.status(200).json(data);
    } catch (error) {
      sendAccountError(error, response);
    }
  });

  // Deletes the account after the customer types DELETE and, for password
  // accounts, re-enters the password. The refresh cookie is cleared by the client
  // signing out; every session is already revoked server-side.
  router.delete("/", async (request: Request, response: Response) => {
    const current = context(request);
    if (!current) return sendUnavailable(response);
    const body: unknown = request.body;
    const fields =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    try {
      const summary = await current.runtime.store.eraseAccount(
        current.userId,
        fields.confirm,
        fields.password,
        current.now,
      );
      response.status(200).json({ deleted: true, summary });
    } catch (error) {
      sendAccountError(error, response);
    }
  });

  return router;
}
