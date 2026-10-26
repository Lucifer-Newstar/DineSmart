"use client";

import { Suspense } from "react";
import { OrderTrackingView } from "./order-tracking-view";

/** The order ID comes from the URL, so the view streams in after the static shell. */
export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <main className="orders-page" id="main-content">
          <div className="orders-state" role="status">
            <span className="orders-state-mark">···</span>
            <h2>Loading your order</h2>
          </div>
        </main>
      }
    >
      <OrderTrackingView />
    </Suspense>
  );
}
