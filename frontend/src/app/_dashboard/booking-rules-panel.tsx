"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  type BookingRulesErrors,
  type BookingRulesForm,
  parseBookingRulesResponse,
  partyRangeLabel,
  validateBookingRules,
} from "./booking-rules-data";
import "./reservations.css";
import { apiSend, useApiResource } from "./use-api";

/** S5-01: managers set turn times, pacing and the online booking window. */
export function BookingRulesPanel({
  accessToken,
  canEdit,
  onToast,
}: {
  accessToken: string | null;
  canEdit: boolean;
  onToast: (message: string) => void;
}) {
  const resource = useApiResource("/booking-rules", accessToken, parseBookingRulesResponse);
  const [form, setForm] = useState<BookingRulesForm | null>(null);
  const [errors, setErrors] = useState<BookingRulesErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (resource.data) setForm(resource.data.form);
  }, [resource.data]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !accessToken) return;
    const result = validateBookingRules(form);
    if (result.errors) {
      setErrors(result.errors);
      onToast("Check the highlighted booking rules.");
      return;
    }
    setErrors({});
    setSaving(true);
    const response = await apiSend("/booking-rules", accessToken, "PUT", result.body);
    setSaving(false);
    onToast(response.ok ? "Booking rules saved." : response.message);
    if (response.ok) resource.reload();
  };

  const field = (
    name: Exclude<keyof BookingRulesForm, "turnTimes">,
    label: string,
    hint: string,
  ) => (
    <label className="form-field">
      <span>{label}</span>
      <input
        aria-describedby={`booking-rule-${name}-hint${errors[name] ? ` booking-rule-${name}-error` : ""}`}
        aria-invalid={errors[name] ? true : undefined}
        disabled={!canEdit || saving}
        inputMode="numeric"
        value={form?.[name] ?? ""}
        onChange={(event) =>
          setForm((current) => (current ? { ...current, [name]: event.target.value } : current))
        }
      />
      <small id={`booking-rule-${name}-hint`}>{hint}</small>
      {errors[name] ? (
        <small className="field-error" id={`booking-rule-${name}-error`}>
          {errors[name]}
        </small>
      ) : null}
    </label>
  );

  return (
    <article className="card booking-rules-card" aria-labelledby="booking-rules-title">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">RESERVATIONS</div>
          <h2 id="booking-rules-title">Booking rules</h2>
        </div>
        {resource.data?.usingDefaults ? <span className="cell-subline">Using defaults</span> : null}
      </div>
      {resource.status === "loading" && !form ? <p role="status">Loading booking rules…</p> : null}
      {resource.status === "unavailable" ? (
        <p role="alert">Booking rules are unavailable right now.</p>
      ) : null}
      {form ? (
        <form className="booking-rules-form" onSubmit={save} noValidate>
          <fieldset>
            <legend>Turn time by party size (minutes)</legend>
            {form.turnTimes.map((row, index) => (
              <label className="form-field" key={row.maxPartySize}>
                <span>{partyRangeLabel(form.turnTimes, index)}</span>
                <input
                  aria-invalid={errors[`turn-${index}`] ? true : undefined}
                  disabled={!canEdit || saving}
                  inputMode="numeric"
                  value={row.minutes}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            turnTimes: current.turnTimes.map((candidate, position) =>
                              position === index
                                ? { ...candidate, minutes: event.target.value }
                                : candidate,
                            ),
                          }
                        : current,
                    )
                  }
                />
                {errors[`turn-${index}`] ? (
                  <small className="field-error">{errors[`turn-${index}`]}</small>
                ) : null}
              </label>
            ))}
          </fieldset>
          {field(
            "pacingCoversPer15Min",
            "Online covers per 15 minutes",
            "Pacing: guests who may start in the same 15-minute window.",
          )}
          {field("minLeadMinutes", "Minimum notice (minutes)", "How soon a guest can book online.")}
          {field("maxAdvanceDays", "Booking window (days)", "How far ahead guests can book.")}
          {field(
            "changeCutoffMinutes",
            "Change cutoff (minutes)",
            "Guests can change or cancel online until this long before the start.",
          )}
          {canEdit ? (
            <button className="button button-dark" disabled={saving} type="submit">
              {saving ? "Saving…" : "Save booking rules"}
            </button>
          ) : (
            <p className="cell-subline">Only managers can change booking rules.</p>
          )}
        </form>
      ) : null}
    </article>
  );
}
