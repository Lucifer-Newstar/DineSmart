import compression from "compression";
import type { Request, Response } from "express";

/**
 * Payloads smaller than this threshold are sent uncompressed because the
 * negotiation and codec overhead outweighs the transfer saving.
 */
export const PUBLIC_JSON_COMPRESSION_THRESHOLD_BYTES = 1_024;

/**
 * Response compression is restricted to public, non-sensitive JSON payloads.
 * Authenticated operational responses are intentionally excluded so tenant
 * data is never compressed alongside attacker-controlled input.
 */
export function createPublicJsonCompression() {
  return compression({
    threshold: PUBLIC_JSON_COMPRESSION_THRESHOLD_BYTES,
    filter: (_request: Request, response: Response) =>
      String(response.getHeader("Content-Type") ?? "").startsWith("application/json"),
  });
}
