"use client";

import { useEffect, useState } from "react";
import { apiSend, useApiResource } from "../_dashboard/use-api";
import { type NotificationPreference, parseNotificationPreferences } from "./notification-data";

/**
 * In-app notification toggles for the signed-in user (S5-04). Each change is
 * saved at once; incident alerts for staff cannot be turned off.
 */
export function NotificationPreferencesFields({
  accessToken,
  idPrefix,
}: {
  accessToken: string | null;
  idPrefix: string;
}) {
  const resource = useApiResource(
    "/notifications/preferences",
    accessToken,
    parseNotificationPreferences,
  );
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (resource.data) setItems(resource.data);
  }, [resource.data]);

  const toggle = async (key: string, enabled: boolean) => {
    if (!accessToken) return;
    setSaving(key);
    setStatus("");
    setItems((current) => current.map((item) => (item.key === key ? { ...item, enabled } : item)));
    const result = await apiSend("/notifications/preferences", accessToken, "PUT", {
      [key]: enabled,
    });
    setSaving(null);
    const saved = result.ok ? parseNotificationPreferences(result.data) : null;
    if (saved) {
      setItems(saved);
      setStatus("Notification settings saved.");
      return;
    }
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, enabled: !enabled } : item)),
    );
    setStatus(result.ok ? "Your change was not saved." : result.message);
  };

  const legendId = `${idPrefix}-notifications-legend`;
  return (
    <fieldset className="notification-preferences" aria-labelledby={legendId}>
      <legend id={legendId}>In-app notifications</legend>
      {!accessToken ? (
        <p className="panel-state">Sign in to choose your notifications.</p>
      ) : resource.status === "loading" && items.length === 0 ? (
        <p className="panel-state">Loading your notification settings…</p>
      ) : resource.status === "unavailable" || resource.status === "restricted" ? (
        <p className="panel-state panel-state-error">
          Notification settings could not be loaded.{" "}
          <button type="button" className="text-button" onClick={resource.reload}>
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="panel-state">Your role has no optional notifications.</p>
      ) : (
        items.map((item) => (
          <label key={item.key}>
            <input
              checked={item.enabled}
              disabled={saving !== null}
              type="checkbox"
              onChange={(event) => void toggle(item.key, event.target.checked)}
            />{" "}
            {item.label}
          </label>
        ))
      )}
      <p className="notification-preferences-status" role="status">
        {status}
      </p>
    </fieldset>
  );
}
