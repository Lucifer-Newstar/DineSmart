import assert from "node:assert/strict";
import test from "node:test";
import { tabId, tabIndexForKey } from "../src/app/roving-tabs.ts";

test("arrow keys step through the tabs and wrap at both ends", () => {
  assert.equal(tabIndexForKey("ArrowRight", 0, 4), 1);
  assert.equal(tabIndexForKey("ArrowRight", 3, 4), 0);
  assert.equal(tabIndexForKey("ArrowLeft", 0, 4), 3);
  assert.equal(tabIndexForKey("ArrowDown", 1, 4), 2);
  assert.equal(tabIndexForKey("ArrowUp", 1, 4), 0);
});

test("Home and End jump to the first and last tab", () => {
  assert.equal(tabIndexForKey("Home", 2, 4), 0);
  assert.equal(tabIndexForKey("End", 0, 4), 3);
});

test("other keys and empty lists are left to the browser", () => {
  assert.equal(tabIndexForKey("Enter", 1, 4), null);
  assert.equal(tabIndexForKey("ArrowRight", 0, 0), null);
});

test("tab ids are stable and safe for any label", () => {
  assert.equal(tabId("menu-tab", "All dishes"), "menu-tab-all-dishes");
  assert.equal(tabId("menu-tab", "Rice & Biryani"), "menu-tab-rice-biryani");
});
