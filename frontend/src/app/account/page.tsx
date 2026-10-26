"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import {
  type AccountProfile,
  canConfirmDeletion,
  exportFileName,
  type PasswordForm,
  parseAccountProfile,
  validateName,
  validatePasswordForm,
} from "./account-data";

const API_BASE = "/api/v1";

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

function PasswordSection({
  accessToken,
  hasPassword,
  onChanged,
}: {
  accessToken: string;
  hasPassword: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const empty: PasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
  const [form, setForm] = useState<PasswordForm>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordForm, string>>>({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  if (!hasPassword) {
    return (
      <section className="account-card" aria-labelledby="account-password-title">
        <h2 id="account-password-title">Password</h2>
        <p className="account-readonly">
          You sign in with Google. To add a password, use{" "}
          <Link href="/forgot-password">password reset</Link>.
        </p>
      </section>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validatePasswordForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/auth/password/change`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Your password was not changed."));
      }
      setForm(empty);
      setStatus("Password changed. Other devices have been signed out.");
      // The response set a new refresh cookie for this device; take a token from it.
      await onChanged();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Your password was not changed.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof PasswordForm, label: string, autoComplete: string) => (
    <label className="account-field">
      <span>{label}</span>
      <input
        aria-describedby={errors[key] ? `account-${key}-error` : undefined}
        aria-invalid={errors[key] ? true : undefined}
        autoComplete={autoComplete}
        type="password"
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      />
      {errors[key] ? (
        <small className="account-error" id={`account-${key}-error`}>
          {errors[key]}
        </small>
      ) : null}
    </label>
  );

  return (
    <form
      aria-labelledby="account-password-title"
      className="account-card"
      onSubmit={submit}
      noValidate
    >
      <h2 id="account-password-title">Password</h2>
      {field("currentPassword", "Current password", "current-password")}
      {field("newPassword", "New password", "new-password")}
      {field("confirmPassword", "Confirm new password", "new-password")}
      <button className="orders-primary-button" disabled={saving} type="submit">
        {saving ? "Changing…" : "Change password"}
      </button>
      <p className="account-status" role="status">
        {status}
      </p>
    </form>
  );
}

function DataSection({
  accessToken,
  hasPassword,
  onDeleted,
}: {
  accessToken: string;
  hasPassword: boolean;
  onDeleted: () => Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setExporting(true);
    setStatus("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/account/export`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response, "The export failed."));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(
        response.headers.get("Content-Disposition"),
        new Date().toISOString().slice(0, 10),
      );
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("Your data download has started.");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  };

  const erase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConfirmDeletion(typed, password, hasPassword)) return;
    setDeleting(true);
    setStatus("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed, ...(hasPassword ? { password } : {}) }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, "Your account was not deleted."));
      await onDeleted();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Your account was not deleted.");
      setDeleting(false);
    }
  };

  return (
    <section className="account-card account-danger" aria-labelledby="account-data-title">
      <h2 id="account-data-title">Your data</h2>
      <p className="account-readonly">
        Download your profile, bookings, orders, bills and notifications as a JSON file.
      </p>
      <button
        className="orders-secondary-link"
        disabled={exporting}
        type="button"
        onClick={() => void download()}
      >
        {exporting ? "Preparing…" : "Download my data"}
      </button>
      {confirming ? (
        <form className="account-delete-form" onSubmit={erase} noValidate>
          <p className="account-readonly">
            Deleting your account removes your name, email, notes and notifications, cancels
            upcoming bookings and signs you out everywhere. Restaurants keep order totals without
            your name. This cannot be undone.
          </p>
          <label className="account-field">
            <span>Type DELETE to confirm</span>
            <input
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
          {hasPassword ? (
            <label className="account-field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          ) : null}
          <div className="orders-header-actions">
            <button
              className="account-danger-button"
              disabled={deleting || !canConfirmDeletion(typed, password, hasPassword)}
              type="submit"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
            <button
              className="orders-secondary-link"
              type="button"
              onClick={() => setConfirming(false)}
            >
              Keep my account
            </button>
          </div>
        </form>
      ) : (
        <button className="account-danger-button" type="button" onClick={() => setConfirming(true)}>
          Delete account…
        </button>
      )}
      <p className="account-status" role="status">
        {status}
      </p>
    </section>
  );
}

/** S5-02: a customer's own profile, contact preferences, password and data. */
export default function AccountPage() {
  const { user, accessToken, isLoading: authLoading, refreshSession, signOut } = useAuth();
  const router = useRouter();
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

  // Load once. A renewed access token (after a save or a password change) must not
  // reload the page and wipe the status messages.
  const loaded = useRef(false);
  useEffect(() => {
    if (user?.role !== "Customer" || !accessToken || loaded.current) return;
    loaded.current = true;
    void load();
  }, [accessToken, load, user?.role]);

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
          <>
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
            <PasswordSection
              accessToken={accessToken}
              hasPassword={profile.hasPassword}
              onChanged={refreshSession}
            />
            <DataSection
              accessToken={accessToken}
              hasPassword={profile.hasPassword}
              onDeleted={async () => {
                await signOut();
                router.replace("/");
              }}
            />
          </>
        )}
      </section>
    </main>
  );
}
