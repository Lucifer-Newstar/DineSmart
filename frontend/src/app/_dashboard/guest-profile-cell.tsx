"use client";

import { useState } from "react";
import {
  GUEST_TAG_OPTIONS,
  type GuestProfileView,
  guestHistoryLine,
  needsAllergyAttention,
} from "./guest-profile-data";
import { apiSend } from "./use-api";

/** Guest history, tags and notes beside a booking, with an inline editor (S5-02). */
export function GuestProfileCell({
  guest,
  customerId,
  profile,
  occasion,
  dietaryNotes,
  notes,
  accessToken,
  onSaved,
  onToast,
}: {
  guest: string;
  customerId?: string;
  profile?: GuestProfileView;
  occasion?: string;
  dietaryNotes?: string;
  notes?: string;
  accessToken: string | null;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(profile?.tags ?? []);
  const [note, setNote] = useState(profile?.staffNote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!accessToken || !customerId) return;
    setSaving(true);
    const result = await apiSend(`/guests/${customerId}`, accessToken, "PUT", {
      tags,
      staffNote: note.trim() ? note.trim() : null,
    });
    setSaving(false);
    onToast(result.ok ? `Guest notes saved for ${guest}.` : result.message);
    if (result.ok) {
      setEditing(false);
      onSaved();
    }
  };

  return (
    <div className="guest-profile">
      {profile ? <span className="cell-subline">{guestHistoryLine(profile)}</span> : null}
      {profile?.tags.length ? (
        <ul aria-label={`Tags for ${guest}`} className="guest-tags">
          {profile.tags.map((tag) => (
            <li className={tag === "allergy" ? "guest-tag guest-tag-alert" : "guest-tag"} key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {needsAllergyAttention(profile, dietaryNotes) && dietaryNotes ? (
        <span className="guest-alert">Dietary: {dietaryNotes}</span>
      ) : null}
      {occasion ? <span className="cell-subline">Occasion: {occasion}</span> : null}
      {notes ? <span className="cell-subline">Guest note: {notes}</span> : null}
      {profile?.staffNote ? (
        <span className="cell-subline">Staff note: {profile.staffNote}</span>
      ) : null}
      {customerId && accessToken ? (
        editing ? (
          <fieldset className="guest-editor">
            <legend>Edit guest profile for {guest}</legend>
            {GUEST_TAG_OPTIONS.map((tag) => (
              <label key={tag}>
                <input
                  checked={tags.includes(tag)}
                  type="checkbox"
                  onChange={(event) =>
                    setTags((current) =>
                      event.target.checked
                        ? [...current, tag]
                        : current.filter((candidate) => candidate !== tag),
                    )
                  }
                />{" "}
                {tag}
              </label>
            ))}
            <label className="guest-note-field">
              <span>Staff note</span>
              <textarea
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="reservation-actions">
              <button
                className="table-action"
                disabled={saving}
                type="button"
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save guest"}
              </button>
              <button className="table-action" type="button" onClick={() => setEditing(false)}>
                Close
              </button>
            </div>
          </fieldset>
        ) : (
          <button
            aria-label={`Edit guest profile for ${guest}`}
            className="text-link guest-edit-link"
            type="button"
            onClick={() => {
              setTags(profile?.tags ?? []);
              setNote(profile?.staffNote ?? "");
              setEditing(true);
            }}
          >
            Tags and notes
          </button>
        )
      ) : null}
    </div>
  );
}
