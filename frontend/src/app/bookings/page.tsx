"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import {
  type DayAvailability,
  formatSlotTime,
  parseAvailability,
  reconcileSelection,
} from "../book/booking-data";
import { BrandMark } from "../brand-mark";
import {
  bookingStatusLabel,
  type CustomerBooking,
  canChangeBooking,
  groupBookings,
  localParts,
  parseBooking,
  parseBookingList,
} from "./bookings-data";

const API_BASE = "/api/v1";
const TIME_ZONE = "Asia/Kolkata";
const PARTY_SIZES = Array.from({ length: 12 }, (_, index) => String(index + 1));

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

function formatVisit(booking: CustomerBooking): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(booking.startAt));
}

function BookingEditor({
  booking,
  accessToken,
  onSaved,
  onClose,
}: {
  booking: CustomerBooking;
  accessToken: string;
  onSaved: (booking: CustomerBooking) => void;
  onClose: () => void;
}) {
  const initial = localParts(booking.startAt, TIME_ZONE);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [partySize, setPartySize] = useState(String(booking.partySize));
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ date, partySize });
    fetchWithTimeout(`${API_BASE}/reservations/${booking.id}/availability?${query.toString()}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, "No times loaded."));
        const parsed = parseAvailability(await response.json());
        if (!parsed) throw new Error("No times loaded.");
        setDay(parsed);
        setTime((current) => reconcileSelection(parsed, current) ?? current);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setDay(null);
        setError(reason instanceof Error ? reason.message : "No times loaded.");
      });
    return () => controller.abort();
  }, [accessToken, booking.id, date, partySize]);

  // The API leaves this booking out, so its own time shows as open.
  const slots = day?.slots ?? [];
  const selected = slots.find((slot) => slot.localTime === time && slot.available);

  const save = async () => {
    if (!selected) {
      setError("Choose an open time first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/reservations/${booking.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ startAt: selected.startAt, partySize: Number(partySize) }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "The booking could not be changed."));
        return;
      }
      const payload = (await response.json()) as { reservation?: unknown };
      const updated = parseBooking(payload.reservation);
      if (updated) onSaved(updated);
    } catch {
      setError("The booking service did not answer. Your booking was not changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="booking-editor">
      <div className="booking-editor-fields">
        <label className="form-field">
          <span>New date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Guests</span>
          <select value={partySize} onChange={(event) => setPartySize(event.target.value)}>
            {PARTY_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="booking-editor-slots">
        {slots.map((slot) => (
          <button
            aria-pressed={slot.localTime === time}
            className={
              slot.localTime === time ? "booking-slot booking-slot-active" : "booking-slot"
            }
            disabled={!slot.available}
            key={slot.startAt}
            type="button"
            onClick={() => setTime(slot.localTime)}
          >
            {formatSlotTime(slot.localTime)}
          </button>
        ))}
        {day && slots.every((slot) => !slot.available) ? (
          <p className="orders-inline-note">No open times for that date and party size.</p>
        ) : null}
      </div>
      {error ? (
        <p className="orders-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="booking-editor-actions">
        <button
          className="orders-primary-button"
          disabled={saving || !selected}
          type="button"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save change"}
        </button>
        <button className="orders-secondary-link" type="button" onClick={onClose}>
          Keep my booking
        </button>
      </div>
    </div>
  );
}

export default function MyBookingsPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [busyId, setBusyId] = useState("");
  // Read the clock after mount: a prerendered page must not bake in the build time.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setState("loading");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/reservations`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Bookings unavailable."));
      const parsed = parseBookingList(await response.json());
      if (!parsed) throw new Error("Bookings unavailable.");
      setBookings(parsed);
      setNow(new Date());
      setState("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bookings unavailable.");
      setState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    if (user?.role === "Customer") void load();
  }, [load, user?.role]);

  const replace = (updated: CustomerBooking) => {
    setBookings((current) =>
      current.map((booking) => (booking.id === updated.id ? updated : booking)),
    );
  };

  const cancel = async (booking: CustomerBooking) => {
    if (!accessToken) return;
    setBusyId(booking.id);
    setError("");
    try {
      const response = await fetchWithTimeout(`${API_BASE}/reservations/${booking.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "The booking could not be cancelled."));
        return;
      }
      const payload = (await response.json()) as { reservation?: unknown };
      const updated = parseBooking(payload.reservation);
      if (updated) replace(updated);
      setConfirmCancelId("");
    } catch {
      setError("The booking service did not answer. Your booking was not cancelled.");
    } finally {
      setBusyId("");
    }
  };

  const reference = now ?? new Date(0);
  const { upcoming, past } = groupBookings(bookings, reference);

  const card = (booking: CustomerBooking) => (
    <article className="customer-order-card" key={booking.id}>
      <div className="customer-order-heading">
        <div>
          <span className="customer-order-kicker">{booking.restaurantName}</span>
          <h3>{formatVisit(booking)}</h3>
        </div>
        <span className={`order-status order-status-${booking.status.toLowerCase()}`}>
          {bookingStatusLabel(booking.status)}
        </span>
      </div>
      <p className="customer-order-detail">
        {booking.partySize} {booking.partySize === 1 ? "guest" : "guests"}
        {booking.tableNumber ? ` · Table ${booking.tableNumber}` : " · Table assigned on arrival"}
      </p>
      {booking.notes ? <p className="customer-order-detail">Notes: {booking.notes}</p> : null}
      {now && canChangeBooking(booking, reference) ? (
        editingId === booking.id && accessToken ? (
          <BookingEditor
            accessToken={accessToken}
            booking={booking}
            onClose={() => setEditingId("")}
            onSaved={(updated) => {
              replace(updated);
              setEditingId("");
            }}
          />
        ) : confirmCancelId === booking.id ? (
          <div className="customer-order-footer">
            <p>Cancel this booking? The table is released for other guests.</p>
            <button
              className="orders-cancel-button"
              disabled={busyId === booking.id}
              type="button"
              onClick={() => void cancel(booking)}
            >
              {busyId === booking.id ? "Cancelling…" : "Yes, cancel booking"}
            </button>
            <button
              className="orders-secondary-link"
              type="button"
              onClick={() => setConfirmCancelId("")}
            >
              Keep it
            </button>
          </div>
        ) : (
          <div className="customer-order-footer">
            <p>Changes are accepted online until shortly before your visit.</p>
            <button
              className="orders-secondary-link"
              type="button"
              onClick={() => setEditingId(booking.id)}
            >
              Change booking
            </button>
            <button
              className="orders-cancel-button"
              type="button"
              onClick={() => setConfirmCancelId(booking.id)}
            >
              Cancel booking
            </button>
          </div>
        )
      ) : null}
    </article>
  );

  return (
    <main className="orders-page" id="main-content">
      <header className="menu-header orders-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="orders-header-actions">
          <Link className="menu-back-link" href="/book">
            Book a table
          </Link>
          <Link className="menu-back-link" href="/account">
            Account
          </Link>
          <Link className="menu-back-link" href="/">
            Home
          </Link>
        </div>
      </header>
      <section className="orders-content">
        <div className="orders-intro">
          <div>
            <div className="orders-eyebrow">CUSTOMER ACCOUNT</div>
            <h1>My bookings</h1>
            <p>Change or cancel an upcoming table, and look back at past visits.</p>
          </div>
        </div>
        {authLoading || (user?.role === "Customer" && state === "loading") ? (
          <div className="orders-state" role="status">
            <span className="orders-state-mark">···</span>
            <h2>Loading your bookings</h2>
          </div>
        ) : !user || !accessToken ? (
          <div className="orders-state">
            <span className="orders-state-mark">✦</span>
            <h2>Sign in to see your bookings</h2>
            <Link
              className="orders-primary-button"
              href={`/login?next=${encodeURIComponent("/bookings")}`}
            >
              Sign in securely
            </Link>
          </div>
        ) : user.role !== "Customer" ? (
          <div className="orders-state">
            <span className="orders-state-mark">!</span>
            <h2>Bookings here are for guests</h2>
            <Link className="orders-primary-button" href="/">
              Open your workspace
            </Link>
          </div>
        ) : state === "error" ? (
          <div className="orders-state orders-state-error" role="alert">
            <span className="orders-state-mark">!</span>
            <h2>{error || "Bookings unavailable."}</h2>
            <button className="orders-primary-button" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {error ? (
              <p className="orders-inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <h2 className="bookings-section-title">Upcoming</h2>
            {upcoming.length > 0 ? (
              <div className="orders-list">{upcoming.map(card)}</div>
            ) : (
              <p className="orders-inline-note">
                No upcoming bookings. <Link href="/book">Book a table</Link>
              </p>
            )}
            <h2 className="bookings-section-title">Past</h2>
            {past.length > 0 ? (
              <div className="orders-list">{past.map(card)}</div>
            ) : (
              <p className="orders-inline-note">Past visits will appear here.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
