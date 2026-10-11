"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";

function returnPath(): string {
  if (typeof window === "undefined") return "/";
  const requested = new URLSearchParams(window.location.search).get("next");
  return requested?.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\")
    ? requested
    : "/";
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<"details" | "verification">("details");
  const [continuationPath, setContinuationPath] = useState("/");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setContinuationPath(returnPath());
  }, []);

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const result = await register(name.trim(), email.trim(), password);
      setDevelopmentCode(result.developmentCode ?? "");
      setCode(result.developmentCode ?? "");
      setMessage(
        result.message || "If registration can proceed, a verification code has been sent.",
      );
      setStep("verification");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't start registration. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await verifyOtp(email.trim(), code.trim());
      router.push(returnPath());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "That code could not be verified. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    setError("");
    setResending(true);
    try {
      const result = await requestOtp(email.trim());
      setDevelopmentCode(result.developmentCode ?? "");
      if (result.developmentCode) setCode(result.developmentCode);
      setMessage(
        result.message || "If registration can proceed, a verification code has been sent.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "We couldn't resend your code yet.",
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-story" aria-label="DineSmart introduction">
        <Link className="customer-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="auth-story-main">
          <span className="auth-story-kicker">
            <span /> A BETTER SERVICE STARTS TOGETHER
          </span>
          <h1>
            Your team,
            <br />
            <em>in good rhythm.</em>
          </h1>
          <p>Bring the moving parts of a great restaurant shift into one thoughtful workspace.</p>
          <div className="auth-story-list">
            <div>
              <span>✓</span> One view for the details that matter
            </div>
            <div>
              <span>✓</span> Clear steps, no noisy dashboards
            </div>
            <div>
              <span>✓</span> Your people always make the call
            </div>
          </div>
        </div>
        <footer className="auth-story-footer">
          <span>Thoughtful service, in rhythm.</span>
          <span>© 2026 DineSmart</span>
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-card">
          <Link className="auth-mobile-brand" href="/">
            <BrandMark />
            <span>DineSmart</span>
          </Link>
          {step === "details" ? (
            <>
              <div className="auth-form-eyebrow">GET STARTED</div>
              <h2>Set your table.</h2>
              <p>Create a guest account to get started with DineSmart.</p>
              <form className="auth-form" onSubmit={submitDetails}>
                <label className="form-field">
                  <span>Your name</span>
                  <input
                    autoComplete="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Full name"
                    maxLength={120}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Email address</span>
                  <input
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>
                    Create a password <small>(12+ characters)</small>
                  </span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    minLength={12}
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
                  {submitting ? "Preparing your account…" : "Continue with email"}
                </button>
              </form>
              <div className="auth-divider">A SMALL STEP TOWARD BETTER SERVICE</div>
              <p className="auth-switch">
                Already have an account?{" "}
                <Link href={`/login?next=${encodeURIComponent(continuationPath)}`}>Sign in</Link>
              </p>
              <div className="auth-note">
                <span aria-hidden="true">✦</span>
                <span>
                  We’ll send a one-time verification code before activating your account. New
                  self-service accounts are created as guests.
                </span>
              </div>
            </>
          ) : (
            <>
              <button
                className="auth-back"
                type="button"
                onClick={() => {
                  setStep("details");
                  setError("");
                }}
              >
                <span aria-hidden="true">←</span> Back to your details
              </button>
              <div className="auth-form-eyebrow">ONE LAST STEP</div>
              <h2>Check your inbox.</h2>
              <p>
                Enter the six-digit code sent to <strong>{email}</strong> to activate your guest
                account.
              </p>
              {message ? (
                <p className="auth-success" role="status">
                  {message}
                </p>
              ) : null}
              {developmentCode ? (
                <p className="auth-success" role="status">
                  Local mock code: <strong>{developmentCode}</strong>
                </p>
              ) : null}
              <form className="auth-form" onSubmit={submitCode}>
                <label className="form-field">
                  <span>Verification code</span>
                  <input
                    className="auth-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    pattern="[0-9]{6}"
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
                  disabled={submitting || code.length !== 6}
                >
                  {submitting ? "Verifying…" : "Verify and create account"}
                </button>
                <button
                  className="auth-resend"
                  type="button"
                  onClick={() => void resendCode()}
                  disabled={resending}
                >
                  {resending ? "Sending…" : "Didn’t get a code? Send again"}
                </button>
              </form>
              <div className="auth-note">
                <span aria-hidden="true">✦</span>
                <span>
                  Your code is time-limited. After five incorrect attempts, a fresh code is
                  required.
                </span>
              </div>
            </>
          )}
          <Link className="auth-back-link" href="/">
            ← Back to the preview workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
