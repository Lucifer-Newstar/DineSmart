import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeline, hourMarks, shiftDate } from "../src/app/_dashboard/timeline-data.ts";

const window = { date: "2026-10-12", startHour: 11, endHour: 23, timeZone: "Asia/Kolkata" };

function booking(id, table, startAt, endAt, status = "Confirmed") {
  return { id, guest: `Guest ${id}`, party: 2, table, status, startAt, endAt };
}

test("bookings land on their table's row at the right place in the day", () => {
  const rows = buildTimeline(
    [
      // 19:00-20:30 local on a 12-hour (11:00-23:00) window.
      booking("a", "Table 02", "2026-10-12T13:30:00.000Z", "2026-10-12T15:00:00.000Z"),
      booking(
        "b",
        "Unassigned",
        "2026-10-12T06:30:00.000Z",
        "2026-10-12T08:00:00.000Z",
        "Awaiting",
      ),
      booking("c", "Table 10", "2026-10-12T05:30:00.000Z", "2026-10-12T07:00:00.000Z"),
      booking("d", "Table 02", "2026-10-12T06:30:00.000Z", "2026-10-12T08:00:00.000Z"),
    ],
    window,
  );
  assert.deepEqual(
    rows.map((row) => row.table),
    ["Table 02", "Table 10", "Unassigned"],
  );
  const [first, second] = rows[0].blocks;
  assert.equal(first.id, "d");
  assert.equal(second.id, "a");
  assert.equal(second.leftPercent, ((8 * 60) / (12 * 60)) * 100);
  assert.equal(second.widthPercent, (90 / (12 * 60)) * 100);
  assert.equal(second.label, "7:00 pm – 8:30 pm");
});

test("other days, cancellations and no-shows are left off; overflow is clipped", () => {
  const rows = buildTimeline(
    [
      booking("x", "Table 01", "2026-10-13T13:30:00.000Z", "2026-10-13T15:00:00.000Z"),
      booking("y", "Table 01", "2026-10-12T13:30:00.000Z", "2026-10-12T15:00:00.000Z", "Cancelled"),
      booking("z", "Table 01", "2026-10-12T13:30:00.000Z", "2026-10-12T15:00:00.000Z", "NoShow"),
      // 22:30 local with a 90-minute turn runs past 23:00.
      booking("late", "Table 03", "2026-10-12T17:00:00.000Z", "2026-10-12T18:30:00.000Z"),
      // Missing end time falls back to 90 minutes.
      booking("open", "Table 04", "2026-10-12T05:30:00.000Z", undefined),
    ],
    window,
  );
  assert.deepEqual(
    rows.map((row) => row.table),
    ["Table 03", "Table 04"],
  );
  assert.ok(Math.abs(rows[0].blocks[0].leftPercent + rows[0].blocks[0].widthPercent - 100) < 1e-9);
  assert.equal(rows[1].blocks[0].widthPercent, (90 / 720) * 100);
});

test("days shift across month ends and hour marks cover the window", () => {
  assert.equal(shiftDate("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  const marks = hourMarks(window);
  assert.equal(marks.length, 13);
  assert.equal(marks[0], "11:00 am");
  assert.equal(marks.at(-1), "11:00 pm");
});
