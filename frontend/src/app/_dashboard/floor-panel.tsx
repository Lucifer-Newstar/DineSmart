"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  type FloorTable,
  formatQuotedWait,
  minutesWaiting,
  parseTables,
  parseWaitlist,
  quotedWaitOf,
  TABLE_STATUS_LABELS,
  TABLE_TRANSITIONS,
  tablesForParty,
  type WaitlistEntry,
} from "./floor-data";
import { Icon } from "./ui";
import { apiSend, useApiResource } from "./use-api";

interface FloorPanelProps {
  accessToken: string | null;
  /** Bumped by live table/waitlist/reservation events. */
  refreshKey: number;
  onToast: (message: string) => void;
}

function PanelState({ status, what }: { status: string; what: string }) {
  if (status === "loading") return <p className="panel-state">Loading {what}…</p>;
  if (status === "restricted") {
    return <p className="panel-state">Your role can&apos;t view {what}.</p>;
  }
  if (status === "unavailable") {
    return <p className="panel-state panel-state-error">The {what} could not be loaded.</p>;
  }
  return null;
}

/**
 * Floor view for Reception, Managers and Administrators: table status (S2-18) and
 * the walk-in waitlist (S2-17) side by side.
 */
export function FloorPanel({ accessToken, refreshKey, onToast }: FloorPanelProps) {
  const tables = useApiResource("/tables", accessToken, parseTables, refreshKey);
  const waitlist = useApiResource("/waitlist", accessToken, parseWaitlist, refreshKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  if (!accessToken) {
    return (
      <article className="card floor-card">
        <div className="card-overline">FLOOR</div>
        <h2>Tables &amp; waitlist</h2>
        <p className="panel-state">Sign in to manage tables and walk-ins.</p>
      </article>
    );
  }

  const refreshBoth = () => {
    tables.reload();
    waitlist.reload();
  };

  const setTableStatus = async (table: FloorTable, status: string) => {
    setBusy(`table:${table.id}`);
    const result = await apiSend(`/tables/${table.id}/status`, accessToken, "PUT", { status });
    setBusy(null);
    onToast(
      result.ok
        ? `Table ${table.tableNumber} is now ${TABLE_STATUS_LABELS[status]?.toLowerCase() ?? status}.`
        : result.message,
    );
    if (result.ok) tables.reload();
  };

  const resolveEntry = async (entry: WaitlistEntry, body: Record<string, string>) => {
    setBusy(`entry:${entry.id}`);
    const result = await apiSend(`/waitlist/${entry.id}`, accessToken, "PUT", body);
    setBusy(null);
    if (!result.ok) {
      onToast(result.message);
      return;
    }
    onToast(
      body.status === "seated"
        ? `${entry.guestName} is seated.`
        : `${entry.guestName} was removed from the waitlist.`,
    );
    refreshBoth();
  };

  const addWalkIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("add");
    const result = await apiSend("/waitlist", accessToken, "POST", {
      guestName: guestName.trim(),
      partySize: Number(partySize),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(null);
    if (!result.ok) {
      onToast(result.message);
      return;
    }
    const quote = quotedWaitOf(result.data);
    onToast(
      quote === null
        ? `${guestName.trim()} added to the waitlist.`
        : `${guestName.trim()} added to the waitlist. Quote: ${formatQuotedWait(quote).toLowerCase()}.`,
    );
    setGuestName("");
    setPartySize("2");
    setPhone("");
    setNotes("");
    waitlist.reload();
  };

  const tableList = tables.data ?? [];
  const entries = waitlist.data ?? [];

  return (
    <section className="floor-grid" aria-label="Tables and waitlist">
      <article className="card floor-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">FLOOR</div>
            <h2>Tables</h2>
          </div>
          <button
            className="select-button"
            type="button"
            onClick={tables.reload}
            disabled={tables.status === "loading"}
          >
            <Icon name="refresh" size={15} />
            <span>Refresh</span>
          </button>
        </div>
        <PanelState status={tables.status} what="tables" />
        {tables.status === "live" && tableList.length === 0 ? (
          <p className="panel-state">No tables are set up for this restaurant yet.</p>
        ) : null}
        {tableList.length ? (
          <ul className="table-tiles">
            {tableList.map((table) => (
              <li key={table.id} className={`table-tile table-tile-${table.status}`}>
                <div className="table-tile-head">
                  <strong>Table {table.tableNumber}</strong>
                  <span className={`status-pill status-${table.status.replaceAll("_", "-")}`}>
                    {TABLE_STATUS_LABELS[table.status] ?? table.status}
                  </span>
                </div>
                <span className="cell-subline">
                  Seats {table.capacity}
                  {table.zone ? ` · ${table.zone}` : ""}
                </span>
                <label className="table-tile-action">
                  <span className="sr-only">Change status of table {table.tableNumber}</span>
                  <select
                    value=""
                    disabled={busy === `table:${table.id}`}
                    onChange={(event) => {
                      if (event.target.value) void setTableStatus(table, event.target.value);
                    }}
                  >
                    <option value="">Set status…</option>
                    {(TABLE_TRANSITIONS[table.status] ?? []).map((next) => (
                      <option key={next} value={next}>
                        {TABLE_STATUS_LABELS[next] ?? next}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="card floor-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">WALK-INS</div>
            <h2>Waitlist</h2>
          </div>
          <span className="floor-count">{entries.length} waiting</span>
        </div>
        <form className="walk-in-form" onSubmit={addWalkIn}>
          <label className="form-field">
            <span>Guest name</span>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label className="form-field walk-in-party">
            <span>Party</span>
            <input
              type="number"
              min={1}
              max={12}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>Phone (optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={20}
            />
          </label>
          <label className="form-field walk-in-notes">
            <span>Notes (optional)</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
            />
          </label>
          <button className="button button-dark" type="submit" disabled={busy === "add"}>
            <Icon name="plus" size={15} /> {busy === "add" ? "Adding…" : "Add walk-in"}
          </button>
        </form>
        <PanelState status={waitlist.status} what="waitlist" />
        {waitlist.status === "live" && entries.length === 0 ? (
          <p className="panel-state">Nobody is waiting right now.</p>
        ) : null}
        {entries.length ? (
          <ol className="waitlist-list">
            {entries.map((entry) => {
              const options = tablesForParty(tableList, entry.partySize);
              const disabled = busy === `entry:${entry.id}`;
              return (
                <li key={entry.id}>
                  <div>
                    <span className="cell-strong">
                      {entry.guestName} · {entry.partySize}
                    </span>
                    <span className="cell-subline">
                      Waiting {minutesWaiting(entry.createdAt)} min
                      {entry.quotedWaitMinutes === undefined
                        ? ""
                        : ` · Quoted: ${formatQuotedWait(entry.quotedWaitMinutes)}`}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                    </span>
                  </div>
                  <div className="waitlist-actions">
                    <label>
                      <span className="sr-only">Seat {entry.guestName} at a table</span>
                      <select
                        value=""
                        disabled={disabled || options.length === 0}
                        onChange={(event) => {
                          if (event.target.value) {
                            void resolveEntry(entry, {
                              status: "seated",
                              tableId: event.target.value,
                            });
                          }
                        }}
                      >
                        <option value="">
                          {options.length ? "Seat at…" : "No free table fits"}
                        </option>
                        {options.map((table) => (
                          <option key={table.id} value={table.id}>
                            Table {table.tableNumber} ({table.capacity})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      onClick={() => void resolveEntry(entry, { status: "no_show" })}
                    >
                      No show
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      onClick={() => void resolveEntry(entry, { status: "cancelled" })}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </article>
    </section>
  );
}
