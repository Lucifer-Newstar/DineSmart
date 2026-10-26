import assert from "node:assert/strict";
import test from "node:test";
import {
  guestHistoryLine,
  needsAllergyAttention,
  parseGuestProfile,
} from "../src/app/_dashboard/guest-profile-data.ts";

test("guest profiles parse defensively", () => {
  assert.deepEqual(
    parseGuestProfile({
      visitCount: 3,
      noShowCount: 1,
      lastVisitAt: "2026-10-02T14:00:00.000Z",
      tags: ["VIP", 7],
      staffNote: "Window seat",
    }),
    {
      visitCount: 3,
      noShowCount: 1,
      lastVisitAt: "2026-10-02T14:00:00.000Z",
      tags: ["VIP"],
      staffNote: "Window seat",
    },
  );
  assert.equal(parseGuestProfile({ visitCount: "3" }), null);
  assert.equal(parseGuestProfile(undefined), null);
});

test("the history line reads like a host would say it", () => {
  const first = { visitCount: 0, noShowCount: 0, lastVisitAt: null, tags: [], staffNote: null };
  assert.equal(guestHistoryLine(first), "First visit");
  assert.equal(
    guestHistoryLine({ ...first, visitCount: 1, lastVisitAt: "2026-10-02T14:00:00.000Z" }),
    "1 visit · last 2 Oct 2026",
  );
  assert.equal(
    guestHistoryLine({ ...first, visitCount: 4, noShowCount: 2 }),
    "4 visits · 2 no-shows",
  );
});

test("allergy tags or dietary notes raise the allergy flag", () => {
  const base = { visitCount: 1, noShowCount: 0, lastVisitAt: null, tags: [], staffNote: null };
  assert.equal(needsAllergyAttention(base), false);
  assert.equal(needsAllergyAttention({ ...base, tags: ["allergy"] }), true);
  assert.equal(needsAllergyAttention(undefined, "No shellfish"), true);
});
