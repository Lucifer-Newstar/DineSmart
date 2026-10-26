import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../brand-mark";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker (S5-05) when a page cannot load without a connection. */
export default function OfflinePage() {
  return (
    <main className="orders-page" id="main-content">
      <header className="menu-header orders-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
      </header>
      <section className="orders-content">
        <div className="orders-state">
          <span className="orders-state-mark" aria-hidden="true">
            !
          </span>
          <h1>You are offline</h1>
          <p>
            This page needs a connection. The menu you last opened can still be read, but orders and
            bookings wait until you are back online.
          </p>
          <a className="orders-primary-button" href="/menu">
            Read the saved menu
          </a>
        </div>
      </section>
    </main>
  );
}
