/**
 * Shared browser API client for the dashboard and customer screens.
 *
 * Every request is bounded: a caller-supplied abort signal (used when the
 * dashboard workspace changes) is combined with a deadline, so a stalled
 * connection resolves into an explicit timeout instead of leaving a panel in
 * its loading state forever.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** Raised when a request exceeds its deadline. */
export class ApiTimeoutError extends Error {
  readonly kind = "timeout";

  constructor(readonly timeoutMs: number) {
    super(`The request did not complete within ${timeoutMs} ms.`);
    this.name = "ApiTimeoutError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function isRequestTimeout(error: unknown): boolean {
  return error instanceof ApiTimeoutError;
}

export type RequestFailureKind = "abort" | "timeout" | "error";

/** Classifies a rejected request so screens can pick the right message. */
export function classifyRequestError(error: unknown): RequestFailureKind {
  if (isRequestTimeout(error)) return "timeout";
  if (isAbortError(error)) return "abort";
  return "error";
}

export interface FetchWithTimeoutOptions {
  readonly timeoutMs?: number;
}

/**
 * `fetch` with a deadline. The returned promise rejects with `ApiTimeoutError`
 * once the deadline passes, and with the caller's abort reason when the
 * supplied signal aborts first.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const externalSignal = init.signal ?? null;
  const forwardAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(new ApiTimeoutError(timeoutMs)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // A caller-initiated abort stays an abort even if it races the deadline.
    if (externalSignal?.aborted) throw externalSignal.reason ?? error;
    if (controller.signal.reason instanceof ApiTimeoutError) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}
