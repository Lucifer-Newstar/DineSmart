"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import { GoogleSignInButton } from "../google-sign-in";

function returnPath(): string {
  if (typeof window === "undefined") return "/";
  const requested = new URLSearchParams(window.location.search).get("next");
  return requested?.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\")
    ? requested
    : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const goHome = useCallback(() => router.push(returnPath()), [router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      goHome();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Sign-in failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
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
            <span /> RESTAURANT OPERATIONS, IN RHYTHM
          </span>
          <h1>
            Make room for
            <br />
            <em>great service.</em>
          </h1>
          <p>One thoughtful workspace for the details behind a memorable meal.</p>
          <div className="auth-story-list">
            <div>
              <span>✓</span> Keep the whole shift in view
            </div>
            <div>
              <span>✓</span> Make earlier, calmer calls
            </div>
            <div>
              <span>✓</span> Let your team stay in control
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
          <div className="auth-form-eyebrow">WELCOME BACK</div>
          <h2>Good to see you.</h2>
          <p>Sign in to pick up right where your service left off.</p>
          <form className="auth-form" onSubmit={submit}>
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
            <label className="form-field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button button-dark auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in securely"}
            </button>
          </form>
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <>
              <div className="auth-divider">OR CONTINUE WITH</div>
              <GoogleSignInButton onSuccess={goHome} />
            </>
          ) : (
            <div className="auth-divider">YOUR RESTAURANT, YOUR SHIFT</div>
          )}
          <p className="auth-switch">
            New to DineSmart? <Link href="/register">Create an account</Link>
          </p>
          <div className="auth-note">
            <span aria-hidden="true">✦</span>
            <span>
              Session credentials stay protected. Your access token is held in memory; the refresh
              token is an HttpOnly cookie.
            </span>
          </div>
          <Link className="auth-back-link" href="/">
            ← Back to the preview workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
