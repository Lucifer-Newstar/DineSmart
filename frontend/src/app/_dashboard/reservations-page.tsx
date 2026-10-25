"use client";

import type { Reservation, ReservationViewStatus } from "./types";
import { Icon, ScrollRegion, StatusPill } from "./ui";

export function ReservationsPage({
  reservations,
  status,
  truncated,
  savingId,
  onUpdate,
  onRefresh,
  onToast,
}: {
  reservations: Reservation[];
  status: ReservationViewStatus;
  truncated: boolean;
  savingId: string;
  onUpdate: (id: string) => void | Promise<void>;
  onRefresh: () => void;
  onToast: (message: string) => void;
}) {
  const reservationCount = status === "live" ? reservations.length : 12;
  const guestCount =
    status === "live"
      ? reservations.reduce((total, reservation) => total + reservation.party, 0)
      : 38;
  const assignedTables =
    status === "live"
      ? reservations.filter((reservation) => reservation.table !== "Unassigned").length
      : 9;
  const dataLabel =
    status === "live"
      ? "LIVE RESERVATIONS · CHENNAI TIME"
      : status === "loading"
        ? "LOADING RESERVATIONS"
        : status === "unavailable"
          ? "API UNAVAILABLE · SAMPLE DATA"
          : "SAMPLE DATA · PREVIEW ONLY";

  return (
    <>
      <section className="reservation-summary-grid">
        <article>
          <span className="summary-icon summary-icon-green">
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <span>Reservations loaded</span>
            <strong>
              {reservationCount} <small>bookings</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon summary-icon-blue">
            <Icon name="user" size={18} />
          </span>
          <div>
            <span>Party seats</span>
            <strong>
              {guestCount} <small>people</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon summary-icon-gold">
            <Icon name="table" size={18} />
          </span>
          <div>
            <span>Tables assigned today</span>
            <strong>
              {assignedTables} <small>reservations</small>
            </strong>
          </div>
        </article>
      </section>
      <article className="card reservations-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">{dataLabel}</div>
            <h2>Reservation schedule</h2>
          </div>
          <button
            className="select-button"
            type="button"
            onClick={onRefresh}
            disabled={status === "loading"}
          >
            <Icon name="refresh" size={15} />
            <span>{status === "loading" ? "Loading…" : "Refresh"}</span>
          </button>
        </div>
        <ScrollRegion label="Reservations">
          <table className="data-table reservation-table">
            <thead>
              <tr>
                <th>Arrival</th>
                <th>Guest</th>
                <th>Party</th>
                <th>Table</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reservations.length ? (
                reservations.map((reservation) => {
                  const action =
                    reservation.status === "Awaiting"
                      ? "Confirm"
                      : reservation.status === "Confirmed"
                        ? "Seat guest"
                        : reservation.status === "Seated"
                          ? "Complete"
                          : null;
                  const statusLabel =
                    reservation.status === "NoShow" ? "No show" : reservation.status;
                  return (
                    <tr key={reservation.id}>
                      <td>
                        <span className="reservation-time">{reservation.time}</span>
                        <span className="cell-subline">
                          {reservation.startAt
                            ? new Intl.DateTimeFormat("en-IN", {
                                timeZone: "Asia/Kolkata",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(reservation.startAt))
                            : reservation.id}
                        </span>
                      </td>
                      <td>
                        <span className="cell-strong">{reservation.guest}</span>
                        <span className="cell-subline">
                          Reservation · {reservation.restaurantName ?? "Saffron & Co."}
                        </span>
                      </td>
                      <td>{reservation.party} guests</td>
                      <td>{reservation.table}</td>
                      <td>
                        <StatusPill>{statusLabel}</StatusPill>
                      </td>
                      <td className="table-action-cell">
                        <button
                          aria-label={
                            action
                              ? `${action} ${reservation.guest}`
                              : `No action for ${reservation.guest}`
                          }
                          className="table-action"
                          disabled={!action || savingId === reservation.id || status === "loading"}
                          type="button"
                          onClick={() => void onUpdate(reservation.id)}
                        >
                          {savingId === reservation.id ? "Saving…" : (action ?? "—")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    {status === "live"
                      ? "No reservations were returned for this restaurant."
                      : "No sample reservations are available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollRegion>
        <div className="reservation-foot">
          <span>
            {status === "live" ? <i className="small-live-dot" /> : null}
            {status === "live"
              ? `${reservations.length}${truncated ? "+" : ""} reservations loaded from the API${truncated ? " (list capped at 500)" : ""}.`
              : status === "loading"
                ? "Loading saved reservations; sample data is shown until the API responds."
                : status === "unavailable"
                  ? "Showing sample reservations. Changes are not saved while the API is unavailable."
                  : "Showing sample reservations. Changes are not saved."}
          </span>
          <button
            className="text-link"
            type="button"
            onClick={() =>
              onToast("Floor planning will be available once table-management APIs are connected.")
            }
          >
            View floor plan <Icon name="arrow-right" size={15} />
          </button>
        </div>
      </article>
      <div className="reservation-note-card">
        <span>
          <Icon name="spark" size={18} />
        </span>
        <div>
          <strong>A smoother welcome starts before the door.</strong>
          <p>Keep guest notes, arrival timing, and table availability together in one calm view.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            onToast("Floor planning will be available once the live workspace is connected.")
          }
        >
          Explore floor plan <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </>
  );
}
