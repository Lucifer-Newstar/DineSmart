import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type CustomerDocument,
  type CustomerUserDocument,
  type ReservationDocument,
  type RestaurantDocument,
  type TableDocument,
} from "../src/database/schema.js";
import { MongoReservationRepository } from "../src/reservations/reservation.repository.js";

const now = new Date("2026-10-11T06:00:00.000Z");

test("reservation repository creates customer profiles and scopes reads, conflicts, and updates", async () => {
  const restaurantId = new ObjectId();
  const userId = new ObjectId();
  const customerId = new ObjectId();
  const reservationId = new ObjectId();
  const tableId = new ObjectId();
  const user = {
    _id: userId,
    name: "Ananya Menon",
    email: "ananya@example.test",
    normalizedEmail: "ananya@example.test",
    role: "Customer",
    restaurantId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies CustomerUserDocument & { _id: ObjectId };
  const customer = {
    _id: customerId,
    userId,
    displayName: "Ananya Menon",
    email: "ananya@example.test",
    createdAt: now,
    updatedAt: now,
  } satisfies CustomerDocument & { _id: ObjectId };
  const restaurant = {
    _id: restaurantId,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    operatingHours: { opensAt: "11:00", closesAt: "23:00" },
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies RestaurantDocument & { _id: ObjectId };
  const table = {
    _id: tableId,
    restaurantId,
    tableNumber: "02",
    capacity: 4,
    status: "available",
    createdAt: now,
    updatedAt: now,
  } satisfies TableDocument & { _id: ObjectId };
  let storedReservation: ReservationDocument & { _id: ObjectId } = {
    _id: reservationId,
    restaurantId,
    customerId,
    partySize: 4,
    startAt: new Date("2026-10-11T13:30:00.000Z"),
    endAt: new Date("2026-10-11T15:00:00.000Z"),
    tableId,
    status: "Confirmed",
    notes: "Window seat",
    createdAt: now,
    updatedAt: now,
  };

  const queries: Array<{ collection: string; operation: string; filter: Record<string, unknown> }> =
    [];
  let profileUpsert: Record<string, unknown> | undefined;
  let updateFields: Record<string, unknown> | undefined;
  const db = {
    collection(name: string) {
      const collection = name;
      return {
        async findOne(filter: Record<string, unknown>) {
          queries.push({ collection, operation: "findOne", filter });
          if (collection === COLLECTIONS.users) return user;
          if (collection === COLLECTIONS.restaurants) return restaurant;
          if (collection === COLLECTIONS.tables) return table;
          if (collection === COLLECTIONS.reservations && "startAt" in filter) return null;
          if (collection === COLLECTIONS.reservations) return storedReservation;
          return customer;
        },
        async findOneAndUpdate(
          filter: Record<string, unknown>,
          update: Record<string, unknown>,
          options: Record<string, unknown>,
        ) {
          queries.push({ collection, operation: "findOneAndUpdate", filter });
          profileUpsert = { filter, update, options };
          return customer;
        },
        find(filter: Record<string, unknown>) {
          queries.push({ collection, operation: "find", filter });
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            async toArray() {
              if (collection === COLLECTIONS.reservations) return [storedReservation];
              if (collection === COLLECTIONS.customers) return [customer];
              if (collection === COLLECTIONS.tables) return [table];
              if (collection === COLLECTIONS.restaurants) return [restaurant];
              return [];
            },
          };
        },
        async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
          queries.push({ collection, operation: "updateOne", filter });
          updateFields = update;
          if (collection === COLLECTIONS.reservations && "$set" in update) {
            storedReservation = {
              ...storedReservation,
              ...(update.$set as Partial<ReservationDocument>),
            };
          }
          return { matchedCount: 1 };
        },
      };
    },
  } as unknown as Db;

  const repository = new MongoReservationRepository(db);
  const foundCustomerId = await repository.getCustomerIdForUser(userId, now);
  const schedule = await repository.getActiveRestaurant(restaurantId);
  const foundTable = await repository.getTable(restaurantId, tableId);
  const conflict = await repository.hasTableConflict(
    restaurantId,
    tableId,
    storedReservation.startAt,
    storedReservation.endAt,
    reservationId,
  );
  const list = await repository.listForRestaurant(restaurantId);
  const customerList = await repository.listForCustomer(customerId);
  const updated = await repository.updateForRestaurant(
    reservationId,
    restaurantId,
    now,
    { status: "Seated" },
    new Date(now.getTime() + 1),
  );
  const customerUpdated = await repository.updateForCustomer(
    reservationId,
    customerId,
    new Date(now.getTime() + 1),
    { status: "Completed" },
    new Date(now.getTime() + 2),
  );

  assert.equal(foundCustomerId, customerId);
  assert.equal(schedule?.timeZone, "Asia/Kolkata");
  assert.equal(foundTable?.capacity, 4);
  assert.equal(conflict, false);
  assert.equal(list.reservations[0]?.guestName, "Ananya Menon");
  assert.equal(list.reservations[0]?.restaurantName, "Saffron & Co.");
  assert.equal(list.reservations[0]?.tableNumber, "02");
  assert.equal(customerList.reservations[0]?.restaurantName, "Saffron & Co.");
  assert.equal(customerList.reservations[0]?.restaurantId, restaurantId);
  assert.equal("email" in (customerList.reservations[0] ?? {}), false);
  assert.equal(updated?.status, "Seated");
  assert.equal(customerUpdated?.status, "Completed");
  assert.deepEqual(profileUpsert, {
    filter: { userId },
    update: {
      $setOnInsert: {
        userId,
        displayName: "Ananya Menon",
        email: "ananya@example.test",
        contactPreferences: { email: true },
        createdAt: now,
        updatedAt: now,
      },
    },
    options: { upsert: true, returnDocument: "after", includeResultMetadata: false },
  });
  assert.deepEqual(updateFields?.$set, {
    status: "Completed",
    updatedAt: new Date(now.getTime() + 2),
  });

  const conflictQuery = queries.find(
    (query) => query.collection === COLLECTIONS.reservations && "startAt" in query.filter,
  );
  assert.deepEqual(conflictQuery?.filter, {
    restaurantId,
    tableId,
    status: {
      $nin: [
        "Cancelled",
        "cancelled",
        "Canceled",
        "canceled",
        "NoShow",
        "No Show",
        "no_show",
        "no-show",
      ],
    },
    startAt: { $lt: storedReservation.endAt },
    endAt: { $gt: storedReservation.startAt },
    _id: { $ne: reservationId },
  });
  const scopedRead = queries.find(
    (query) =>
      query.collection === COLLECTIONS.reservations &&
      query.operation === "find" &&
      "restaurantId" in query.filter,
  );
  assert.equal(scopedRead?.filter.restaurantId, restaurantId);
  const customerHistoryRead = queries.find(
    (query) =>
      query.collection === COLLECTIONS.reservations &&
      query.operation === "find" &&
      "customerId" in query.filter,
  );
  assert.deepEqual(customerHistoryRead?.filter, { customerId });
  const tableLookup = queries.find(
    (query) => query.collection === COLLECTIONS.tables && query.operation === "find",
  );
  assert.deepEqual(tableLookup?.filter, { $or: [{ _id: tableId, restaurantId }] });
  const updateQueries = queries.filter(
    (query) => query.collection === COLLECTIONS.reservations && query.operation === "updateOne",
  );
  assert.deepEqual(updateQueries[0]?.filter, { _id: reservationId, restaurantId, updatedAt: now });
  assert.deepEqual(updateQueries[1]?.filter, {
    _id: reservationId,
    customerId,
    updatedAt: new Date(now.getTime() + 1),
  });
});
