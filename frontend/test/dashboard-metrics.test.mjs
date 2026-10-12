import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_ORDERS_FILTER,
  buildAnalyticsBars,
  formatLoadedCount,
  summarizeIncidents,
  summarizeOrders,
} from "../src/app/dashboard-metrics.ts";

const orders = [
  { id: "A-1001", guest: "Asha", items: "2x Dosa", status: "New", elapsed: 4 },
  { id: "A-1002", guest: "Rahul", items: "1x Biryani", status: "Accepted", elapsed: 9 },
  { id: "A-1003", guest: "Meera", items: "3x Idli", status: "Preparing", elapsed: 12 },
  { id: "A-1004", guest: "Kabir", items: "1x Thali", status: "Ready", elapsed: 18 },
  { id: "A-1005", guest: "asha guest", items: "1x Filter coffee", status: "Served", elapsed: 21 },
];

test("summarizeOrders filters by case-insensitive search and status in one pass", () => {
  const all = summarizeOrders(orders, "", ALL_ORDERS_FILTER);
  assert.deepEqual(
    all.visible.map(({ id }) => id),
    ["A-1001", "A-1002", "A-1003", "A-1004", "A-1005"],
  );
  assert.equal(all.inProgress, 2);
  assert.equal(all.newTickets, 1);
  assert.equal(all.readyToServe, 1);
  assert.equal(all.averageTicketMinutes, 13);

  const searched = summarizeOrders(orders, "ASHA", ALL_ORDERS_FILTER);
  assert.deepEqual(
    searched.visible.map(({ id }) => id),
    ["A-1001", "A-1005"],
  );
  assert.equal(searched.inProgress, 2, "counters still describe the whole feed");

  const filtered = summarizeOrders(orders, "x", "Ready");
  assert.deepEqual(
    filtered.visible.map(({ id }) => id),
    ["A-1004"],
  );
});

test("summarizeOrders handles empty feeds, whitespace queries, and unknown filters", () => {
  const empty = summarizeOrders([], "anything", ALL_ORDERS_FILTER);
  assert.deepEqual(empty.visible, []);
  assert.equal(empty.averageTicketMinutes, null);
  assert.equal(empty.inProgress, 0);

  const padded = summarizeOrders(orders, "   ", ALL_ORDERS_FILTER);
  assert.equal(padded.visible.length, orders.length);

  const unknownStatus = summarizeOrders(orders, "", "Cancelled");
  assert.deepEqual(unknownStatus.visible, []);
  assert.equal(unknownStatus.readyToServe, 1);
});

test("buildAnalyticsBars scales to the peak, floors visible bars, and flags the peak", () => {
  const bars = buildAnalyticsBars(
    [
      { date: "2026-10-06", ordersPlaced: 4 },
      { date: "2026-10-07", ordersPlaced: 0 },
      { date: "2026-10-08", ordersPlaced: 8 },
    ],
    { value: (point) => point.ordersPlaced },
  );

  assert.deepEqual(
    bars.map(({ heightPercent, isPeak }) => [heightPercent, isPeak]),
    [
      [50, false],
      [2, false],
      [100, true],
    ],
  );
  assert.equal(bars[0].point.date, "2026-10-06");
  assert.equal(bars[0].value, 4);
});

test("buildAnalyticsBars honours a custom floor and tolerates empty or flat series", () => {
  const hourly = buildAnalyticsBars(
    [
      { hour: 12, ordersPlaced: 1 },
      { hour: 13, ordersPlaced: 4 },
    ],
    { value: (point) => point.ordersPlaced, minimumPercent: 6 },
  );
  assert.deepEqual(
    hourly.map(({ heightPercent }) => heightPercent),
    [25, 100],
  );

  assert.deepEqual(buildAnalyticsBars([], { value: (point) => point.ordersPlaced }), []);

  const flat = buildAnalyticsBars(
    [
      { hour: 9, ordersPlaced: 3 },
      { hour: 10, ordersPlaced: 3 },
    ],
    { value: (point) => point.ordersPlaced },
  );
  assert.deepEqual(
    flat.map(({ heightPercent, isPeak }) => [heightPercent, isPeak]),
    [
      [100, true],
      [100, true],
    ],
  );

  const zeros = buildAnalyticsBars([{ hour: 9, ordersPlaced: 0 }], {
    value: (point) => point.ordersPlaced,
  });
  assert.deepEqual(
    zeros.map(({ heightPercent, isPeak }) => [heightPercent, isPeak]),
    [[2, false]],
  );
});

test("summarizeIncidents only renders records for live or preview feeds", () => {
  const incidents = [
    { id: "i-1", status: "open" },
    { id: "i-2", status: "active" },
    { id: "i-3", status: "resolved" },
  ];

  const live = summarizeIncidents(incidents, "live");
  assert.deepEqual(
    live.visible.map(({ id }) => id),
    ["i-1", "i-2", "i-3"],
  );
  assert.deepEqual(
    live.open.map(({ id }) => id),
    ["i-1", "i-2"],
  );
  assert.deepEqual(
    live.resolved.map(({ id }) => id),
    ["i-3"],
  );

  assert.deepEqual(summarizeIncidents(incidents, "preview").open.length, 2);

  for (const status of ["loading", "empty", "unavailable", "restricted"]) {
    const hidden = summarizeIncidents(incidents, status);
    assert.deepEqual(hidden, { visible: [], open: [], resolved: [] }, `${status} hides records`);
  }
});

test("formatLoadedCount reports an explicit lower bound at the server cap", () => {
  assert.equal(formatLoadedCount(200, true), "200+");
  assert.equal(formatLoadedCount(201, true), "200+");
  assert.equal(formatLoadedCount(200, false), 200);
  assert.equal(formatLoadedCount(199, true), 199);
  assert.equal(formatLoadedCount(0, true), 0);
});
