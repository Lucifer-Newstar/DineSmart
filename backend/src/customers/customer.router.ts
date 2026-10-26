import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { parseObjectId, requireObjectIdParam } from "../http/object-id-param.js";
import {
  GUEST_NOTE_MAX_LENGTH,
  GUEST_TAGS,
  type GuestProfileStore,
  guestSummaryToJson,
  parseGuestProfileChanges,
} from "./guest-profile.repository.js";

/** Staff-only guest profiles (S5-02): tags and a note per restaurant, never shown to guests. */

export interface GuestRuntime {
  store: GuestProfileStore;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  clock?: () => Date;
}

export interface GuestRouterOptions {
  createRuntime: () => Promise<GuestRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "guest_profiles_unavailable",
      message: "Guest profiles are temporarily unavailable.",
    },
  });
}

export function createGuestRouter(options: GuestRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, GuestRuntime>();

  router.use(async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, next);
    } catch {
      sendUnavailable(response);
    }
  });

  const guestParam = requireObjectIdParam(
    "customerId",
    "invalid_customer_id",
    "A valid customer ID is required.",
  );

  /** Resolves the runtime, tenant and guest, answering 404 for someone who never visited. */
  async function resolveGuest(request: Request, response: Response) {
    const runtime = runtimes.get(request);
    const restaurantId = request.auth?.restaurantId;
    const customerId = parseObjectId(request.params.customerId);
    if (!runtime || !restaurantId || !customerId) {
      sendUnavailable(response);
      return null;
    }
    const tenant = new ObjectId(restaurantId);
    if (!(await runtime.store.isGuestOf(tenant, customerId))) {
      response.status(404).json({
        error: { code: "guest_not_found", message: "This guest has no history here." },
      });
      return null;
    }
    return { runtime, tenant, customerId };
  }

  router.get(
    "/:customerId",
    requirePermissions("reservations:read"),
    requireRestaurantScope(),
    guestParam,
    async (request: Request, response: Response) => {
      try {
        const guest = await resolveGuest(request, response);
        if (!guest) return;
        const profile = await guest.runtime.store.get(guest.tenant, guest.customerId);
        response.set("Cache-Control", "no-store");
        response.status(200).json({ profile: guestSummaryToJson(profile) });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  router.put(
    "/:customerId",
    requirePermissions("reservations:write"),
    requireRestaurantScope(),
    guestParam,
    async (request: Request, response: Response) => {
      const changes = parseGuestProfileChanges(request.body);
      if (!changes) {
        response.status(400).json({
          error: {
            code: "invalid_guest_profile",
            message: `Send tags from ${GUEST_TAGS.join(", ")} and a note of at most ${GUEST_NOTE_MAX_LENGTH} characters.`,
          },
        });
        return;
      }
      try {
        const guest = await resolveGuest(request, response);
        if (!guest) return;
        const now = guest.runtime.clock?.() ?? new Date();
        const profile = await guest.runtime.store.update(
          guest.tenant,
          guest.customerId,
          changes,
          now,
        );
        response.status(200).json({ profile: guestSummaryToJson(profile) });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
