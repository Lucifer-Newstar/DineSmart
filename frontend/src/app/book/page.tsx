"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";

const API_BASE = "/api/v1";
const RESTAURANT_ID = process.env.NEXT_PUBLIC_DEMO_RESTAURANT_ID ?? "710000000000000000000001";
const TIME_ZONE = "Asia/Kolkata";
const TIMES = Array.from({ length: 22 }, (_, index) => {
  const minutes = 11 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

interface SavedReservation {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
}

function indiaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function indiaMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]));
  return (values.get("hour") ?? 0) * 60 + (values.get("minute") ?? 0);
}

function formatTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function parseReservation(value: unknown): SavedReservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (
    typeof response.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(response.id) ||
    typeof response.status !== "string" ||
    typeof response.startAt !== "string" ||
    !Number.isFinite(Date.parse(response.startAt)) ||
    typeof response.endAt !== "string" ||
    !Number.isFinite(Date.parse(response.endAt))
  ) {
    return null;
  }
  return {
    id: response.id,
    status: response.status,
    startAt: response.startAt,
    endAt: response.endAt,
  };
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const error = payload.error;
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return error.message;
      }
    }
  } catch {
    // Use a stable message for non-JSON proxy/service errors.
  }
  return "We couldn't save your reservation request. Please try again.";
}

export default function BookTablePage() {
  const { user, accessToken, isLoading } = useAuth();
  const [today, setToday] = useState("");
  const [nowMinutes, setNowMinutes] = useState(0);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [guests, setGuests] = useState("2");
  const [notes, setNotes] = useState("");
  const [savedReservation, setSavedReservation] = useState<SavedReservation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canBook = user?.role === "Customer" && Boolean(accessToken);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!canBook || !accessToken) {
      setError("Sign in with a guest account to send a reservation request.");
      return;
    }

    const [hour, minute] = time.split(":").map(Number);
    const localStart = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
    setSubmitting(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/reservations`, {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: RESTAURANT_ID,
          partySize: Number(guests),
          startAt: new Date(localStart).toISOString(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload: unknown = await response.json();
      const saved =
        typeof payload === "object" && payload !== null && "reservation" in payload
          ? parseReservation(payload.reservation)
          : null;
      if (!saved) throw new Error("The reservation response was invalid; please try again.");
      setSavedReservation(saved);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Reservations are unavailable. Your request was not saved.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSavedReservation(null);
    setError("");
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setToday(indiaDate(now));
      setNowMinutes(indiaMinutes(now));
    };
    const now = new Date();
    const currentDate = indiaDate(now);
    setToday(currentDate);
    setDate((current) => current || currentDate);
    setNowMinutes(indiaMinutes(now));
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const noAvailableSlots =
    date === today &&
    !TIMES.some((slot) => {
      const [hour, minute] = slot.split(":").map(Number);
      return hour * 60 + minute > nowMinutes;
    });

  useEffect(() => {
    if (date !== today) return;
    const [selectedHour, selectedMinute] = time.split(":").map(Number);
    if (selectedHour * 60 + selectedMinute > nowMinutes) return;
    const nextAvailable = TIMES.find((slot) => {
      const [hour, minute] = slot.split(":").map(Number);
      return hour * 60 + minute > nowMinutes;
    });
    if (nextAvailable) setTime(nextAvailable);
  }, [date, time, today, nowMinutes]);

  return (
    <main className="book-page" id="main-content">
      <header className="menu-header book-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="menu-restaurant">
          <span className="menu-restaurant-mark">S</span>
          <span>
            <strong>Saffron &amp; Co.</strong>
            <small>Adyar · Chennai</small>
          </span>
          <i className="menu-open-dot" />
        </div>
        <Link className="menu-back-link" href="/menu">
          ← Back to menu
        </Link>
      </header>
      <div className="book-layout">
        <section className="book-story">
          <div className="menu-eyebrow">
            <span /> A SEAT AT THE TABLE, SAVED FOR YOU
          </div>
          <h1>
            Good evenings
            <br />
            are <em>better shared.</em>
          </h1>
          <p>
            Choose a time, bring your favourite people, and we’ll send your request directly to the
            restaurant.
          </p>
          <div className="book-venue-card">
            <span className="book-venue-icon">S</span>
            <div>
              <strong>Saffron &amp; Co.</strong>
              <span>12, 2nd Main Road · Adyar, Chennai</span>
              <small>Daily · 11:00 am – 11:00 pm · All times IST</small>
            </div>
          </div>
          <div className="book-promise">
            <span>✦</span>
            <p>
              Your request is held for 15 minutes after its start time. If plans change, you can
              cancel before the reservation begins.
            </p>
          </div>
        </section>
        <section className="book-form-wrap">
          <div className="book-form-card">
            <div className="menu-section-eyebrow">YOUR EVENING, YOUR WAY</div>
            <h2>{savedReservation ? "Your request is with us." : "Reserve a table"}</h2>
            {savedReservation ? (
              <div className="book-confirmation" role="status">
                <span>✓</span>
                <strong>Thanks, {user?.name.split(" ")[0] || "there"}.</strong>
                <p>
                  Your request for {guests} {guests === "1" ? "guest" : "guests"} on {date} at{" "}
                  {formatTime(time)} has been saved.
                </p>
                <p>
                  Status: {savedReservation.status}. The restaurant must confirm your request before
                  the table is confirmed.
                </p>
                <p>Reference: {savedReservation.id}</p>
                <Link href="/menu" className="button button-dark">
                  Browse the menu
                </Link>
                <button className="book-edit-link" type="button" onClick={resetForm}>
                  Request another time
                </button>
              </div>
            ) : (
              <>
                <p className="book-subtitle">A few details, and we’ll have a place ready.</p>
                {user?.role === "Customer" ? (
                  <p className="book-account-note">
                    Booking as <strong>{user.name}</strong> · {user.email}
                  </p>
                ) : isLoading ? (
                  <p className="book-account-note">Checking your guest account…</p>
                ) : user ? (
                  <p className="book-account-note" role="status">
                    A guest account is required to make this request. Your staff workspace is not
                    used for customer bookings.
                  </p>
                ) : (
                  <div className="book-account-note">
                    <span>
                      Sign in to send a request—reservation details are linked to your account.
                    </span>
                    <span>
                      <Link href="/login?next=%2Fbook">Sign in</Link> or{" "}
                      <Link href="/register?next=%2Fbook">create a guest account</Link>.
                    </span>
                  </div>
                )}
                <form className="book-form" onSubmit={submit}>
                  <div className="book-form-row">
                    <label className="form-field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={date}
                        min={today}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Party size</span>
                      <select value={guests} onChange={(event) => setGuests(event.target.value)}>
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => (
                          <option key={number} value={number}>
                            {number} {number === 1 ? "guest" : "guests"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="book-time-label">
                    <span>Choose a time</span>
                    <small>All times in IST · 90-minute seating</small>
                  </div>
                  <div className="book-time-grid">
                    {TIMES.map((slot) => {
                      const [hour, minute] = slot.split(":").map(Number);
                      const unavailable = date === today && hour * 60 + minute <= nowMinutes;
                      return (
                        <button
                          aria-pressed={time === slot}
                          className={time === slot ? "book-time-active" : ""}
                          disabled={unavailable}
                          key={slot}
                          type="button"
                          onClick={() => setTime(slot)}
                        >
                          {formatTime(slot)}
                        </button>
                      );
                    })}
                  </div>
                  {noAvailableSlots ? (
                    <p className="book-preview-note" role="status">
                      No remaining reservation times today. Please choose another date.
                    </p>
                  ) : null}
                  <label className="form-field">
                    <span>
                      Notes for the restaurant <small>(optional)</small>
                    </span>
                    <input
                      maxLength={500}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Seating preference or special request"
                    />
                  </label>
                  {error ? (
                    <p className="book-request-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <button
                    className="button button-dark book-submit"
                    disabled={!canBook || submitting || isLoading || noAvailableSlots}
                    type="submit"
                  >
                    {submitting
                      ? "Sending request…"
                      : isLoading
                        ? "Checking account…"
                        : canBook
                          ? "Request this table"
                          : "Sign in to request a table"}{" "}
                    <span>→</span>
                  </button>
                </form>
                <p className="book-preview-note">
                  Requests are saved only after the API confirms success. A request is not a
                  confirmed table until restaurant staff accept it.
                </p>
              </>
            )}
          </div>
        </section>
      </div>
      <footer className="menu-footer book-footer">
        <span>SAFFRON &amp; CO. · ADYAR</span>
        <span>© 2026 DineSmart</span>
        <Link href="/menu">See the dinner menu →</Link>
      </footer>
    </main>
  );
}
