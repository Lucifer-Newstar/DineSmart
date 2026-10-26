import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "uqr";
import { menuLinkFor, parseQrLinks, qrModulesPath } from "../src/app/_dashboard/table-qr-data.ts";

test("table links parse, keep only signed tokens and sort by table number", () => {
  assert.deepEqual(
    parseQrLinks({
      tables: [
        { tableId: "b", tableNumber: "10", token: "t1.b" },
        { tableId: "a", tableNumber: "2", token: "t1.a" },
        { tableId: "c", tableNumber: "3", token: "forged" },
      ],
    })?.map((link) => link.tableNumber),
    ["2", "10"],
  );
  assert.equal(parseQrLinks({}), null);
});

test("the printed link opens the menu with the token escaped", () => {
  assert.equal(
    menuLinkFor("https://dinesmart.example/", "t1.a.b.0.x.sig_-"),
    "https://dinesmart.example/menu?table=t1.a.b.0.x.sig_-",
  );
  assert.equal(
    menuLinkFor("http://localhost:3000", "a b"),
    "http://localhost:3000/menu?table=a%20b",
  );
});

test("module rows merge into one path segment per dark run", () => {
  assert.equal(
    qrModulesPath([
      [true, true, false, true],
      [false, false, false, false],
    ]),
    "M0 0h2v1h-2zM3 0h1v1h-1z",
  );
  const encoded = encode("http://localhost:3000/menu?table=t1.x", { ecc: "M", border: 2 });
  const path = qrModulesPath(encoded.data);
  const darkModules = encoded.data.flat().filter(Boolean).length;
  const painted = [...path.matchAll(/h(\d+)v1/g)].reduce(
    (total, match) => total + Number(match[1]),
    0,
  );
  assert.equal(painted, darkModules);
});
