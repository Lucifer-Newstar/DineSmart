"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { BrandMark } from "../brand-mark";

const API_BASE = "/api/v1";
const MIN_PASSWORD_LENGTH = 12;

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** S2-15: request a reset code by email, then set a new password with it. */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/auth/reset-password/request`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "We couldn't send a reset code right now."));
      }
      const result = (await response.json()) as { message?: string; developmentCode?: string };
      setDevelopmentCode(result.developmentCode ?? "");
      if (result.developmentCode) setCode(result.developmentCode);
      setMessage(
        result.message ??
          "If an eligible account exists, password reset instructions have been sent.",
      );
      setStep("confirm");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "We couldn't send a reset code.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/auth/reset-password/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword: password }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(response, "That code could not be used. Request a new one."),
        );
      }
      setStep("done");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "We couldn't reset your password.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page auth-page-single" id="main-content">
      <section className="auth-form-side">
        <div className="auth-form-card">
          <Link className="auth-mobile-brand auth-brand-visible" href="/">
            <BrandMark />
            <span>DineSmart</span>
          </Link>
          <div className="auth-form-eyebrow">ACCOUNT RECOVERY</div>
          {step === "done" ? (
            <>
              <h2>Password updated.</h2>
              <p>
                Your other sessions were signed out. Sign in with your new password to continue.
              </p>
              <Link className="button button-dark auth-submit" href="/login">
                Go to sign in
              </Link>
            </>
          ) : step === "request" ? (
            <>
              <h2>Reset your password.</h2>
              <p>Enter the email you sign in with and we&apos;ll send you a six-digit code.</p>
              <form className="auth-form" onSubmit={requestCode}>
                <label className="form-field">
                  <span>Email address</span>
                  <input
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@restaurant.com"
                    required
                  />
                </label>
                {error ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  className="button button-dark auth-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : "Send reset code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2>Check your inbox.</h2>
              <p role="status">{message}</p>
              {developmentCode ? (
                <p className="auth-note">
                  <span aria-hidden="true">✦</span>
                  <span>Local development code: {developmentCode}</span>
                </p>
              ) : null}
              <form className="auth-form" onSubmit={confirmReset}>
                <label className="form-field">
                  <span>Six-digit code</span>
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>New password</span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Confirm new password</span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </label>
                {error ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  className="button button-dark auth-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Updating…" : "Set new password"}
                </button>
              </form>
              <p className="auth-switch">
                No code?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void requestCode()}
                  disabled={submitting}
                >
                  Send another
                </button>
              </p>
            </>
          )}
          <Link className="auth-back-link" href="/login">
            ← Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
