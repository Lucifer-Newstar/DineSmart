"use client";

import { useEffect, useState } from "react";
import "./reservations.css";
import { buildTimeline, hourMarks, shiftDate, type TimelineReservation } from "./timeline-data";

const TIME_ZONE = "Asia/Kolkata";

function todayInRestaurant(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayHeading(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** A day view of bookings laid out by table and time (S5-01). */
export function ReservationsTimeline({
  reservations,
}: {
  reservations: readonly TimelineReservation[];
}) {
  // Today is read after mount so a prerender never fixes the build date.
  const [date, setDate] = useState("");
  useEffect(() => setDate(todayInRestaurant()), []);
  const window = { date, startHour: 11, endHour: 23, timeZone: TIME_ZONE };
  const rows = date ? buildTimeline(reservations, window) : [];
  const marks = hourMarks(window);

  return (
    <article aria-labelledby="timeline-heading" className="card reservations-timeline">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">DAY TIMELINE · BY TABLE</div>
          <h2 id="timeline-heading">{date ? dayHeading(date) : "Today"}</h2>
        </div>
        <div className="timeline-day-controls">
          <button
            className="select-button"
            type="button"
            onClick={() => setDate((current) => shiftDate(current, -1))}
          >
            Previous day
          </button>
          <button
            className="select-button"
            type="button"
            onClick={() => setDate(todayInRestaurant())}
          >
            Today
          </button>
          <button
            className="select-button"
            type="button"
            onClick={() => setDate((current) => shiftDate(current, 1))}
          >
            Next day
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="timeline-empty">No active bookings on this day.</p>
      ) : (
        <div className="timeline-grid">
          <div aria-hidden="true" className="timeline-scale">
            <span className="timeline-row-label" />
            <div className="timeline-marks">
              {marks.map((mark) => (
                <span key={mark}>{mark}</span>
              ))}
            </div>
          </div>
          <ul className="timeline-rows">
            {rows.map((row) => (
              <li className="timeline-row" key={row.table}>
                <span className="timeline-row-label">{row.table}</span>
                <ul aria-label={`Bookings at ${row.table}`} className="timeline-track">
                  {row.blocks.map((block) => (
                    <li
                      className={`timeline-block timeline-block-${block.status.toLowerCase()}`}
                      key={block.id}
                      style={{ left: `${block.leftPercent}%`, width: `${block.widthPercent}%` }}
                    >
                      <strong>{block.guest}</strong>
                      <span>
                        {block.label} · {block.party} guests · {block.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
