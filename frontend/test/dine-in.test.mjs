import assert from "node:assert/strict";
import test from "node:test";
import {
  isTableToken,
  orderBody,
  parseResolvedTable,
  tableTokenFromSearch,
} from "../src/app/menu/dine-in.ts";

const token = `t1.${"a".repeat(24)}.${"b".repeat(24)}.0.mh2k3x.${"Z".repeat(22)}`;

test("the table token is read from the menu link and checked for shape", () => {
  assert.equal(tableTokenFromSearch(`?table=${token}`), token);
  assert.equal(tableTokenFromSearch("?table=nope"), null);
  assert.equal(tableTokenFromSearch(""), null);
  assert.equal(isTableToken(token), true);
  assert.equal(isTableToken(`${token}x`), false);
});

test("the resolved table keeps the token for the order", () => {
  const table = parseResolvedTable(
    { table: { restaurantId: "r1", tableId: "t4", tableNumber: "04", restaurantName: "Saffron" } },
    token,
  );
  assert.deepEqual(table, { token, restaurantId: "r1", tableId: "t4", tableNumber: "04" });
  assert.equal(parseResolvedTable({ table: { restaurantId: "r1" } }, token), null);
});

test("dine-in orders carry the table token; pickup orders and other restaurants do not", () => {
  const table = { token, restaurantId: "R1", tableId: "t4", tableNumber: "04" };
  assert.deepEqual(orderBody("r1", [{ q: 1 }], table), {
    restaurantId: "r1",
    items: [{ q: 1 }],
    tableToken: token,
  });
  assert.deepEqual(orderBody("r1", [], null), { restaurantId: "r1", items: [] });
  assert.deepEqual(orderBody("r2", [], table), { restaurantId: "r2", items: [] });
});
