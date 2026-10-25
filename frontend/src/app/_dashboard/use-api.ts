"use client";

import { useCallback, useEffect, useState } from "react";
import { classifyRequestError, fetchWithTimeout } from "../api-client";

const API_BASE = "/api/v1";

export type ResourceStatus = "idle" | "loading" | "live" | "unavailable" | "restricted";

export interface ApiResource<T> {
  data: T | null;
  status: ResourceStatus;
  reload: () => void;
}

/**
 * GETs one authenticated API resource and re-fetches when the token, the path or
 * `refreshKey` changes. 401/403 is "restricted"; anything else that fails is
 * "unavailable", so every panel can show a clear state instead of spinning.
 */
export function useApiResource<T>(
  path: string | null,
  accessToken: string | null,
  parse: (value: unknown) => T | null,
  refreshKey = 0,
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ResourceStatus>("idle");
  const [localKey, setLocalKey] = useState(0);
  const reload = useCallback(() => setLocalKey((key) => key + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: parse is a stable module function
  useEffect(() => {
    if (!path || !accessToken) {
      setData(null);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    void fetchWithTimeout(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setStatus("restricted");
          return;
        }
        if (!response.ok) throw new Error("unavailable");
        const parsed = parse(await response.json());
        if (controller.signal.aborted) return;
        if (!parsed) throw new Error("invalid");
        setData(parsed);
        setStatus("live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        setStatus("unavailable");
      });
    return () => controller.abort();
  }, [path, accessToken, refreshKey, localKey]);

  return { data, status, reload };
}

export interface ApiSendResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string;
}

/** Sends one authenticated write and returns the API's own error message on failure. */
export async function apiSend<T>(
  path: string,
  accessToken: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiSendResult<T>> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? "")
        : "";
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? (payload as T) : null,
      message: message || (response.ok ? "" : "The request could not be completed."),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      message:
        classifyRequestError(error) === "timeout"
          ? "The API took too long to answer. Try again."
          : "The API is not reachable right now.",
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
