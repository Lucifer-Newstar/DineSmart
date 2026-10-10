"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { BrandMark } from "../brand-mark";

const TIMES = ["6:00 pm", "6:30 pm", "7:00 pm", "7:30 pm", "8:00 pm", "8:30 pm"];

export default function BookTablePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("2026-10-10");
  const [time, setTime] = useState("7:00 pm");
  const [guests, setGuests] = useState("2");
  const [submitted, setSubmitted] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

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
            Choose a time, bring your favourite people, and we’ll take care of the little things.
          </p>
          <div className="book-venue-card">
            <span className="book-venue-icon">S</span>
            <div>
              <strong>Saffron &amp; Co.</strong>
              <span>12, 2nd Main Road · Adyar, Chennai</span>
              <small>Open today · 12:00 pm – 10:30 pm</small>
            </div>
          </div>
          <div className="book-promise">
            <span>✦</span>
            <p>
              We’ll hold your table for 15 minutes after your reservation time. If plans change,
              just let us know.
            </p>
          </div>
        </section>
        <section className="book-form-wrap">
          <div className="book-form-card">
            <div className="menu-section-eyebrow">YOUR EVENING, YOUR WAY</div>
            <h2>{submitted ? "We’ve saved your request." : "Reserve a table"}</h2>
            {submitted ? (
              <div className="book-confirmation" role="status">
                <span>✓</span>
                <strong>Thanks, {name.split(" ")[0] || "there"}.</strong>
                <p>
                  Your preview request is for {guests} {guests === "1" ? "guest" : "guests"} on{" "}
                  {date} at {time}.
                </p>
                <p>
                  This is a visual preview only—the restaurant hasn’t received a reservation yet.
                </p>
                <Link href="/menu" className="button button-dark">
                  Browse the menu
                </Link>
                <button
                  className="book-edit-link"
                  type="button"
                  onClick={() => setSubmitted(false)}
                >
                  Change details
                </button>
              </div>
            ) : (
              <>
                <p className="book-subtitle">A few details, and we’ll have a place ready.</p>
                <form className="book-form" onSubmit={submit}>
                  <div className="book-form-row">
                    <label className="form-field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={date}
                        min="2026-10-10"
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Party size</span>
                      <select value={guests} onChange={(event) => setGuests(event.target.value)}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((number) => (
                          <option key={number} value={number}>
                            {number} {number === 1 ? "guest" : "guests"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="book-time-label">
                    <span>Choose a time</span>
                    <small>All times in IST</small>
                  </div>
                  <div className="book-time-grid">
                    {TIMES.map((slot) => (
                      <button
                        className={time === slot ? "book-time-active" : ""}
                        key={slot}
                        type="button"
                        onClick={() => setTime(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  <label className="form-field">
                    <span>Your name</span>
                    <input
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Full name"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Email address</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <button className="button button-dark book-submit" type="submit">
                    Request this table <span>→</span>
                  </button>
                </form>
                <p className="book-preview-note">
                  Preview only · Your table is not confirmed or sent to the restaurant.
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
