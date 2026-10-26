import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createReservationRouter } from "../src/reservations/reservation.router.js";
import type {
  CustomerReservationRequest,
  CustomerReservationUpdate,
  ReservationRecord,
  ReservationServiceReader,
  StaffReservationRequest,
  StaffReservationUpdate,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const customerId = new ObjectId();
const userId = new ObjectId();
const tableId = new ObjectId();
const reservationId = new ObjectId();
const startAt = new Date("2026-10-11T13:30:00.000Z");

const reservation: ReservationRecord = {
  id: reservationId,
  restaurantId,
  restaurantName: "Saffron & Co.",
  guestName: "Ananya Menon",
  partySize: 4,
  startAt,
  endAt: new Date("2026-10-11T15:00:00.000Z"),
  tableId,
  tableNumber: "02",
  status: "Confirmed",
  notes: "Window seat",
  createdAt: new Date("2026-10-10T12:00:00.000Z"),
  updatedAt: new Date("2026-10-10T12:00:00.000Z"),
};

interface Calls {
  customerCreate?: CustomerReservationRequest;
  staffCreate?: StaffReservationRequest;
  customerUpdate?: CustomerReservationUpdate;
  staffUpdate?: StaffReservationUpdate;
  customerList?: ObjectId;
  restaurantList?: ObjectId;
}

async function getResponse(input: {
  principal: AuthPrincipal;
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  token?: string;
}) {
  const calls: Calls = {};
  const service: ReservationServiceReader = {
    listForCustomer: async (id) => {
      calls.customerList = id;
      return { reservations: [reservation], truncated: false };
    },
    listForRestaurant: async (id) => {
      calls.restaurantList = id;
      return { reservations: [reservation], truncated: false };
    },
    createForCustomer: async (request) => {
      calls.customerCreate = request;
      return reservation;
    },
    createForStaff: async (request) => {
      calls.staffCreate = request;
      return reservation;
    },
    updateForCustomer: async (request) => {
      calls.customerUpdate = request;
      return { ...reservation, status: "Cancelled" };
    },
    updateForStaff: async (request) => {
      calls.staffUpdate = request;
      return { ...reservation, ...request.changes };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/reservations",
    createReservationRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          if (token !== "valid-reservation-token") throw new Error("invalid token");
          return input.principal;
        },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    return { response, calls };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function principal(role: AuthPrincipal["role"], tenant = restaurantId): AuthPrincipal {
  return {
    userId: role === "Customer" ? userId.toHexString() : new ObjectId().toHexString(),
    role,
    restaurantId: role === "Customer" ? null : tenant.toHexString(),
  };
}

test("customer reservation creation uses the authenticated customer identity", async () => {
  const { response, calls } = await getResponse({
    principal: principal("Customer"),
    method: "POST",
    path: "/api/v1/reservations",
    body: {
      restaurantId: restaurantId.toHexString(),
      partySize: 4,
      startAt: "2026-10-11T19:00:00+05:30",
      notes: "Window seat",
    },
    token: "valid-reservation-token",
  });

  assert.equal(response.status, 201);
  const payload = (await response.json()) as { reservation: { id: string; endAt: string } };
  assert.equal(payload.reservation.id, reservationId.toHexString());
  assert.equal(payload.reservation.endAt, "2026-10-11T15:00:00.000Z");
  assert.equal(calls.customerCreate?.userId.toHexString(), userId.toHexString());
  assert.equal(calls.customerCreate?.restaurantId.toHexString(), restaurantId.toHexString());
  assert.equal(calls.customerCreate?.startAt.toISOString(), startAt.toISOString());
});

test("customers list only their own cross-restaurant reservation history", async () => {
  const { response, calls } = await getResponse({
    principal: principal("Customer"),
    path: "/api/v1/reservations",
    token: "valid-reservation-token",
  });

  assert.equal(response.status, 200);
  assert.equal(calls.customerList?.toHexString(), userId.toHexString());
  const payload = (await response.json()) as {
    reservations: Array<Record<string, unknown>>;
    truncated: boolean;
  };
  assert.equal(payload.truncated, false);
  assert.equal(payload.reservations[0]?.restaurantName, "Saffron & Co.");
  assert.equal(payload.reservations[0]?.restaurantId, restaurantId.toHexString());
  assert.equal("email" in (payload.reservations[0] ?? {}), false);
});

test("staff reads and creates reservations with the signed restaurant scope", async () => {
  const staff = principal("Reception");
  const list = await getResponse({
    principal: staff,
    path: "/api/v1/reservations",
    token: "valid-reservation-token",
  });
  assert.equal(list.response.status, 200);
  assert.equal(list.calls.restaurantList?.toHexString(), restaurantId.toHexString());

  const created = await getResponse({
    principal: staff,
    method: "POST",
    path: "/api/v1/reservations",
    body: {
      customerId: customerId.toHexString(),
      partySize: 2,
      startAt: "2026-10-11T19:00:00+05:30",
      tableId: tableId.toHexString(),
    },
    token: "valid-reservation-token",
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.calls.staffCreate?.restaurantId.toHexString(), restaurantId.toHexString());
  assert.equal(created.calls.staffCreate?.customerId.toHexString(), customerId.toHexString());
});

test("reservation routes enforce role permissions and tenant scope", async () => {
  const kitchenRead = await getResponse({
    principal: principal("Kitchen Staff"),
    path: "/api/v1/reservations",
    token: "valid-reservation-token",
  });
  assert.equal(kitchenRead.response.status, 403);

  const mismatch = await getResponse({
    principal: principal("Manager"),
    path: `/api/v1/reservations?restaurantId=${otherRestaurantId.toHexString()}`,
    token: "valid-reservation-token",
  });
  assert.equal(mismatch.response.status, 403);

  const forgedCustomer = await getResponse({
    principal: principal("Customer"),
    method: "POST",
    path: "/api/v1/reservations",
    body: {
      restaurantId: restaurantId.toHexString(),
      customerId: customerId.toHexString(),
      partySize: 2,
      startAt: "2026-10-11T19:00:00+05:30",
    },
    token: "valid-reservation-token",
  });
  assert.equal(forgedCustomer.response.status, 400);
});

test("customers cancel or change their own booking and staff updates are tenant scoped", async () => {
  const customerCancel = await getResponse({
    principal: principal("Customer"),
    method: "PUT",
    path: `/api/v1/reservations/${reservationId.toHexString()}`,
    body: { status: "Cancelled" },
    token: "valid-reservation-token",
  });
  assert.equal(customerCancel.response.status, 200);
  assert.equal(customerCancel.calls.customerUpdate?.userId.toHexString(), userId.toHexString());

  const customerEdit = await getResponse({
    principal: principal("Customer"),
    method: "PUT",
    path: `/api/v1/reservations/${reservationId.toHexString()}`,
    body: { partySize: 6 },
    token: "valid-reservation-token",
  });
  assert.equal(customerEdit.response.status, 200);
  assert.equal(customerEdit.calls.customerUpdate?.partySize, 6);
  assert.equal(customerEdit.calls.customerUpdate?.status, undefined);

  for (const body of [
    { tableId: tableId.toHexString() },
    { status: "Seated" },
    { status: "Cancelled", partySize: 3 },
  ]) {
    const refused = await getResponse({
      principal: principal("Customer"),
      method: "PUT",
      path: `/api/v1/reservations/${reservationId.toHexString()}`,
      body,
      token: "valid-reservation-token",
    });
    assert.equal(refused.response.status, 400);
    assert.equal(refused.calls.customerUpdate, undefined);
  }

  const staffUpdate = await getResponse({
    principal: principal("Manager"),
    method: "PUT",
    path: `/api/v1/reservations/${reservationId.toHexString()}`,
    body: { status: "Seated" },
    token: "valid-reservation-token",
  });
  assert.equal(staffUpdate.response.status, 200);
  assert.equal(
    staffUpdate.calls.staffUpdate?.restaurantId.toHexString(),
    restaurantId.toHexString(),
  );
  assert.equal(staffUpdate.calls.staffUpdate?.changes.status, "Seated");
});

test("reservation routes validate authorization, identifiers, and time zones", async () => {
  const missingToken = await getResponse({
    principal: principal("Customer"),
    path: "/api/v1/reservations",
  });
  assert.equal(missingToken.response.status, 401);

  const invalidId = await getResponse({
    principal: principal("Customer"),
    method: "PUT",
    path: "/api/v1/reservations/not-an-id",
    body: { status: "Cancelled" },
    token: "valid-reservation-token",
  });
  assert.equal(invalidId.response.status, 400);

  const naiveTime = await getResponse({
    principal: principal("Customer"),
    method: "POST",
    path: "/api/v1/reservations",
    body: {
      restaurantId: restaurantId.toHexString(),
      partySize: 2,
      startAt: "2026-10-11T19:00:00",
    },
    token: "valid-reservation-token",
  });
  assert.equal(naiveTime.response.status, 400);
});
