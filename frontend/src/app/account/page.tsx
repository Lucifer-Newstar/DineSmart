"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import { type AccountProfile, parseAccountProfile, validateName } from "./account-data";

const API_BASE = "/api/v1";

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

/** S5-02: a customer's own profile, contact preferences, password and data. */
export default function AccountPage() {
  const { user, accessToken, isLoading: authLoading, refreshSession } = useAuth();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [prefs, setPrefs] = useState({ email: true, offers: false });
  const [nameError, setNameError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setState("loading");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/account/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Account unavailable."));
      const parsed = parseAccountProfile(await response.json());
      if (!parsed) throw new Error("Account unavailable.");
      setProfile(parsed);
      setName(parsed.name);
      setPrefs(parsed.contactPreferences);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    if (user?.role === "Customer") void load();
  }, [load, user?.role]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    const problem = validateName(name);
    setNameError(problem ?? "");
    if (problem) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/account/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), contactPreferences: prefs }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, "Your changes were not saved."));
      const parsed = parseAccountProfile(await response.json());
      if (parsed) setProfile(parsed);
      setStatus("Profile saved.");
      // The header shows the name from the session, so renew it.
      void refreshSession();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Your changes were not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="orders-page" id="main-content">
      <header className="menu-header orders-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="orders-header-actions">
          <Link className="menu-back-link" href="/bookings">
            My bookings
          </Link>
          <Link className="menu-back-link" href="/">
            Home
          </Link>
        </div>
      </header>
      <section className="orders-content account-content">
        <div className="orders-intro">
          <div>
            <div className="orders-eyebrow">CUSTOMER ACCOUNT</div>
            <h1>Account settings</h1>
            <p>Your name, how we contact you, your password and your data.</p>
          </div>
        </div>
        {authLoading || (user?.role === "Customer" && state === "loading") ? (
          <div className="orders-state" role="status">
            <span className="orders-state-mark">···</span>
            <h2>Loading your account</h2>
          </div>
        ) : !user || !accessToken ? (
          <div className="orders-state">
            <span className="orders-state-mark">✦</span>
            <h2>Sign in to manage your account</h2>
            <Link
              className="orders-primary-button"
              href={`/login?next=${encodeURIComponent("/account")}`}
            >
              Sign in securely
            </Link>
          </div>
        ) : user.role !== "Customer" ? (
          <div className="orders-state">
            <span className="orders-state-mark">!</span>
            <h2>Staff accounts are managed by your restaurant</h2>
            <Link className="orders-primary-button" href="/">
              Open your workspace
            </Link>
          </div>
        ) : state === "error" || !profile ? (
          <div className="orders-state orders-state-error" role="alert">
            <span className="orders-state-mark">!</span>
            <h2>Your account is unavailable right now.</h2>
            <button className="orders-primary-button" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <form className="account-card" onSubmit={saveProfile} noValidate>
            <h2>Profile</h2>
            <label className="account-field">
              <span>Name</span>
              <input
                aria-describedby={nameError ? "account-name-error" : undefined}
                aria-invalid={nameError ? true : undefined}
                autoComplete="name"
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {nameError ? (
                <small className="account-error" id="account-name-error">
                  {nameError}
                </small>
              ) : null}
            </label>
            <p className="account-readonly">
              Email <strong>{profile.email}</strong>
            </p>
            <fieldset className="account-fieldset">
              <legend>Contact preferences</legend>
              <label>
                <input
                  checked={prefs.email}
                  type="checkbox"
                  onChange={(event) =>
                    setPrefs((current) => ({ ...current, email: event.target.checked }))
                  }
                />{" "}
                Booking and order emails
              </label>
              <label>
                <input
                  checked={prefs.offers}
                  type="checkbox"
                  onChange={(event) =>
                    setPrefs((current) => ({ ...current, offers: event.target.checked }))
                  }
                />{" "}
                Occasional offers from restaurants I visit
              </label>
            </fieldset>
            <button className="orders-primary-button" disabled={saving} type="submit">
              {saving ? "Saving…" : "Save profile"}
            </button>
            <p className="account-status" role="status">
              {status}
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
