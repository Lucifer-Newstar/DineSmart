import { type Request, type Response, Router } from "express";
import { type EmailTransport, MockEmailTransport } from "./email-transport.js";

/** Mounted under /api/v1/testing; never mounted when NODE_ENV=production. */
export const MOCK_OUTBOX_PATH = "/api/v1/testing/outbox";

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

function sendNotFound(response: Response): void {
  response.status(404).json({
    error: { code: "route_not_found", message: "The requested API route does not exist." },
  });
}

export interface MockOutboxRouterOptions {
  getTransport: () => EmailTransport;
}

/** The outbox is only mounted outside production, see isMockOutboxEnabled. */
export function isMockOutboxEnabled(nodeEnvironment: string): boolean {
  return nodeEnvironment !== "production";
}

/**
 * Lets automated tests read the codes the mock transport "sent". It answers
 * 404 unless the active transport is the in-memory mock, so a development
 * server that sends real mail through SMTP or Resend never exposes anything.
 */
export function createMockOutboxRouter(options: MockOutboxRouterOptions) {
  const router = Router();

  router.get("/", (request: Request, response: Response) => {
    let transport: EmailTransport | undefined;
    try {
      transport = options.getTransport();
    } catch {
      transport = undefined;
    }
    if (!(transport instanceof MockEmailTransport)) {
      sendNotFound(response);
      return;
    }

    const to = request.query.to;
    if (typeof to !== "string" || !EMAIL_PATTERN.test(to.trim())) {
      response.status(400).json({
        error: { code: "invalid_recipient", message: "Provide one recipient email address." },
      });
      return;
    }

    response.status(200).json({
      messages: transport.outbox(to).map((message) => ({
        to: message.to,
        subject: message.subject,
        text: message.text,
        sentAt: message.sentAt.toISOString(),
      })),
    });
  });

  return router;
}
