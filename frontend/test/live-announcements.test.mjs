import assert from "node:assert/strict";
import test from "node:test";
import { describeArrivals } from "../src/app/live-announcements.ts";

const noun = { one: "order", many: "orders" };

test("the first load is a baseline and is never announced", () => {
  assert.equal(describeArrivals(null, [{ id: "a", label: "#00000A" }], noun), "");
});

test("nothing new means nothing to announce", () => {
  assert.equal(describeArrivals(new Set(["a"]), [{ id: "a", label: "#00000A" }], noun), "");
});

test("one arrival is announced with its label", () => {
  const seen = new Set(["a"]);
  const items = [
    { id: "b", label: "#00000B" },
    { id: "a", label: "#00000A" },
  ];
  assert.equal(describeArrivals(seen, items, noun), "New order: #00000B");
});

test("several arrivals are counted and the newest is named", () => {
  const items = [
    { id: "c", label: "Critical: Paneer is out" },
    { id: "b", label: "Warning: Tomato is low" },
  ];
  assert.equal(
    describeArrivals(new Set(), items, { one: "notification", many: "notifications" }),
    "2 new notifications. Newest: Critical: Paneer is out",
  );
});

test("an arrival without a label still produces a sentence", () => {
  assert.equal(describeArrivals(new Set(), [{ id: "x", label: " " }], noun), "New order");
});
