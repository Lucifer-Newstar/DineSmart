"use client";
import { useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { relativeTime } from "../notifications/notification-data";
import { NotificationPreferencesFields } from "../notifications/notification-preferences";
import { parseSessions, type SignedInDevice } from "./session-data";
import { Icon } from "./ui";
import { apiSend, useApiResource } from "./use-api";

/** S4-04: the signed-in user sees where they are signed in and can end other sessions. */
export function DevicesPanel({
  accessToken,
  onToast,
}: {
  accessToken: string | null;
  onToast: (message: string) => void;
}) {
  const sessions = useApiResource("/auth/sessions", accessToken, parseSessions);
  const [busy, setBusy] = useState<string | null>(null);
  const devices = sessions.data ?? [];
  const others = devices.filter((device) => !device.current);

  const signOut = async (device: SignedInDevice) => {
    if (!accessToken) return;
    setBusy(device.id);
    const result = await apiSend(`/auth/sessions/${device.id}`, accessToken, "DELETE");
    setBusy(null);
    onToast(result.ok ? `Signed out of ${device.deviceLabel}.` : result.message);
    sessions.reload();
  };

  const signOutOthers = async () => {
    if (!accessToken) return;
    setBusy("others");
    const result = await apiSend<{ revoked: number }>("/auth/sessions", accessToken, "DELETE");
    setBusy(null);
    const revoked = result.data?.revoked ?? 0;
    onToast(
      result.ok
        ? `Signed out of ${revoked} other ${revoked === 1 ? "device" : "devices"}.`
        : result.message,
    );
    sessions.reload();
  };

  return (
    <article className="card devices-card" aria-labelledby="devices-title">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">SECURITY</div>
          <h2 id="devices-title">Signed-in devices</h2>
        </div>
        <button
          className="select-button"
          type="button"
          onClick={signOutOthers}
          disabled={!accessToken || others.length === 0 || busy !== null}
        >
          <Icon name="logout" size={15} />
          <span>Sign out of all other devices</span>
        </button>
      </div>
      {!accessToken ? (
        <p className="panel-state">Sign in to see where your account is signed in.</p>
      ) : sessions.status === "loading" && !sessions.data ? (
        <p className="panel-state">Loading your devices…</p>
      ) : sessions.status === "unavailable" || sessions.status === "restricted" ? (
        <p className="panel-state panel-state-error">Your devices could not be loaded.</p>
      ) : (
        <ul className="devices-list">
          {devices.map((device) => (
            <li key={device.id}>
              <span>
                <strong>{device.deviceLabel}</strong>
                <small>
                  {device.current ? "This device · " : ""}Last active{" "}
                  {relativeTime(device.lastUsedAt)}
                </small>
              </span>
              {device.current ? null : (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => signOut(device)}
                  disabled={busy !== null}
                  aria-label={`Sign out of ${device.deviceLabel}, last active ${relativeTime(device.lastUsedAt)}`}
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** S5-04: staff choose their optional in-app alerts; incident alerts always stay on. */
export function NotificationSettingsPanel({ accessToken }: { accessToken: string | null }) {
  return (
    <article className="card devices-card" aria-labelledby="notification-settings-title">
      <div className="card-overline">NOTIFICATIONS</div>
      <h2 id="notification-settings-title">Your alerts</h2>
      <p>Incident alerts always reach you. You can turn the others off.</p>
      <NotificationPreferencesFields accessToken={accessToken} idPrefix="settings" />
    </article>
  );
}

export function SettingsPage({
  userName,
  role,
  onToast,
}: {
  userName: string;
  role: string;
  onToast: (message: string) => void;
}) {
  const [apiState, setApiState] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const checkConnection = async () => {
    setApiState("checking");
    try {
      const response = await fetchWithTimeout("/health", { cache: "no-store" });
      setApiState(response.ok ? "online" : "offline");
      onToast(
        response.ok ? "DineSmart API is reachable." : "The API did not return a healthy response.",
      );
    } catch {
      setApiState("offline");
      onToast("The API is not reachable from this preview yet.");
    }
  };
  return (
    <>
      <section className="settings-grid">
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon">
              <Icon name="user" size={18} />
            </span>
            <span className="settings-state settings-state-ready">
              <i /> ACTIVE SESSION
            </span>
          </div>
          <div className="card-overline">ACCOUNT</div>
          <h2>{userName}</h2>
          <p>Your access is scoped to the role assigned to this account.</p>
          <div className="settings-detail-row">
            <span>Role</span>
            <strong>{role}</strong>
          </div>
          <div className="settings-detail-row">
            <span>Session handling</span>
            <strong>Memory token + secure cookie</strong>
          </div>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-green">
              <Icon name="leaf" size={18} />
            </span>
            <span
              className={`settings-state ${apiState === "online" ? "settings-state-ready" : apiState === "offline" ? "settings-state-offline" : "settings-state-preview"}`}
            >
              <i />
              {apiState === "online" ? "CONNECTED" : apiState === "offline" ? "OFFLINE" : "PREVIEW"}
            </span>
          </div>
          <div className="card-overline">SERVICE CONNECTION</div>
          <h2>Restaurant API</h2>
          <p>
            Requests use the same-origin <code>/api/v1</code> route and are proxied server-side.
          </p>
          <div className="settings-detail-row">
            <span>Health check</span>
            <strong>
              {apiState === "checking"
                ? "Checking…"
                : apiState === "online"
                  ? "Reachable"
                  : apiState === "offline"
                    ? "Not reachable"
                    : "Not checked"}
            </strong>
          </div>
          <button
            className="button button-outline settings-check-button"
            type="button"
            onClick={() => void checkConnection()}
            disabled={apiState === "checking"}
          >
            <Icon name="refresh" size={15} />
            Check connection
          </button>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-gold">
              <Icon name="spark" size={18} />
            </span>
            <span className="settings-state settings-state-preview">
              <i /> ADVISORY ONLY
            </span>
          </div>
          <div className="card-overline">AI ASSIST</div>
          <h2>Recommendations</h2>
          <p>
            Structured suggestions are validated before they appear. Fallback guidance remains
            available if the provider is unavailable.
          </p>
          <div className="settings-detail-row">
            <span>Provider key</span>
            <strong>Server-side only</strong>
          </div>
          <div className="settings-detail-row">
            <span>Operational changes</span>
            <strong>Always human-approved</strong>
          </div>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-blue">
              <Icon name="receipt" size={18} />
            </span>
            <span className="settings-state settings-state-preview">
              <i /> WORKSPACE
            </span>
          </div>
          <div className="card-overline">RESTAURANT PROFILE</div>
          <h2>Saffron &amp; Co.</h2>
          <p>Adyar, Chennai · South Indian · Dinner service</p>
          <div className="settings-detail-row">
            <span>Time zone</span>
            <strong>Asia/Kolkata · IST</strong>
          </div>
          <div className="settings-detail-row">
            <span>Currency</span>
            <strong>Indian rupee · ₹</strong>
          </div>
        </article>
      </section>
      <div className="settings-help">
        <span>
          <Icon name="spark" size={18} />
        </span>
        <div>
          <strong>Building a more connected service.</strong>
          <p>
            Live integrations, restaurant setup, and team provisioning will be available when the
            workspace is configured.
          </p>
        </div>
        <button
          className="text-link"
          type="button"
          onClick={() => onToast("Setup guidance is coming with the live workspace.")}
        >
          Learn more <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </>
  );
}
