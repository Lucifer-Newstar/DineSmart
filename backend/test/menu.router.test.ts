import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createMenuRouter } from "../src/menu/menu.router.js";
import type { MenuReader, PublicMenu } from "../src/menu/menu.types.js";

const restaurantId = new ObjectId();
const itemId = new ObjectId();

const menu: PublicMenu = {
  restaurant: { id: restaurantId, name: "Saffron & Co.", currency: "INR" },
  categories: ["Tiffin"],
  items: [
    {
      id: itemId,
      name: "Ghee podi dosa",
      category: "Tiffin",
      priceMinor: 28_500,
      isAvailable: true,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy"],
    },
  ],
  truncated: false,
};

async function getResponse(options: {
  url: string;
  reader?: MenuReader;
  createReader?: () => Promise<MenuReader>;
}) {
  const reader =
    options.reader ??
    ({
      getAvailableMenu: async () => menu,
    } satisfies MenuReader);
  const app = express();
  app.use(
    "/api/v1/menu",
    createMenuRouter({ createReader: options.createReader ?? (async () => reader) }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}${options.url}`);
    return response;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("public menu route returns only the safe catalog response without authentication", async () => {
  let requestedId: ObjectId | undefined;
  const response = await getResponse({
    url: `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
    reader: {
      getAvailableMenu: async (id) => {
        requestedId = id;
        return menu;
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(requestedId?.toHexString(), restaurantId.toHexString());
  assert.deepEqual(await response.json(), {
    restaurant: { id: restaurantId.toHexString(), name: "Saffron & Co.", currency: "INR" },
    categories: ["Tiffin"],
    items: [
      {
        id: itemId.toHexString(),
        name: "Ghee podi dosa",
        category: "Tiffin",
        priceMinor: 28_500,
        isAvailable: true,
        dietaryLabels: ["vegetarian"],
        allergenLabels: ["dairy"],
      },
    ],
    truncated: false,
  });
});

test("public menu route rejects missing, malformed, and repeated restaurant IDs", async () => {
  for (const url of [
    "/api/v1/menu",
    "/api/v1/menu?restaurantId=not-an-id",
    `/api/v1/menu?restaurantId=${restaurantId.toHexString()}&restaurantId=${itemId.toHexString()}`,
  ]) {
    const response = await getResponse({ url });
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "invalid_restaurant_id");
  }
});

test("public menu route distinguishes missing restaurant and backend failure", async () => {
  const notFound = await getResponse({
    url: `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
    reader: { getAvailableMenu: async () => null },
  });
  assert.equal(notFound.status, 404);

  const unavailable = await getResponse({
    url: `/api/v1/menu?restaurantId=${restaurantId.toHexString()}`,
    createReader: async () => {
      throw new Error("database unavailable");
    },
  });
  assert.equal(unavailable.status, 503);
});
