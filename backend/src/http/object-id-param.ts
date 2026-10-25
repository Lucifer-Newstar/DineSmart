import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ObjectId } from "mongodb";

/** A MongoDB ObjectId in its canonical 24-character hexadecimal form. */
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
}

/** Converts a canonical ObjectId string; anything else (including arrays) is null. */
export function parseObjectId(value: unknown): ObjectId | null {
  return isObjectIdString(value) ? new ObjectId(value) : null;
}

/**
 * Route middleware (S4-04) that answers 400 with the router's own error code
 * when a path parameter is not an ObjectId, before the handler or the database
 * sees it. Mount it after authentication and permission checks so an
 * unauthorised caller still gets 401/403 rather than learning about the format.
 */
export function requireObjectIdParam(param: string, code: string, message: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!isObjectIdString(request.params[param])) {
      response.status(400).json({ error: { code, message } });
      return;
    }
    next();
  };
}
