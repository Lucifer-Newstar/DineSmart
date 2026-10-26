import assert from "node:assert/strict";
import test from "node:test";
import { connectionNotice } from "../src/app/connection-status.ts";

test("the banner is quiet while online and live, connecting or polling", () => {
  assert.equal(connectionNotice(true, "live"), null);
  assert.equal(connectionNotice(true, "connecting"), null);
  assert.equal(connectionNotice(true, "off"), null);
});

test("a dropped socket and a lost network each explain themselves; offline wins", () => {
  assert.match(connectionNotice(true, "offline") ?? "", /^Live updates paused/);
  assert.match(connectionNotice(false, "live") ?? "", /^You are offline/);
  assert.match(connectionNotice(false, "offline") ?? "", /^You are offline/);
});
