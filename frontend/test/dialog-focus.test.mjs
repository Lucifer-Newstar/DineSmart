import assert from "node:assert/strict";
import test from "node:test";
import { nextFocusIndex } from "../src/app/dialog-focus.ts";

test("Tab wraps from the last element to the first", () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, false), 1);
});

test("Shift+Tab wraps from the first element to the last", () => {
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(2, 3, true), 1);
});

test("focus outside the dialog is pulled back in", () => {
  assert.equal(nextFocusIndex(-1, 3, false), 0);
  assert.equal(nextFocusIndex(-1, 3, true), 2);
});

test("an empty dialog has nowhere to move", () => {
  assert.equal(nextFocusIndex(0, 0, false), -1);
});
