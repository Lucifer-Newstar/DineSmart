import { type Document, ObjectId, type WithId } from "mongodb";
import type {
  BillDocument,
  CustomerDocument,
  IncidentDocument,
  InventoryItemDocument,
  MenuItemDocument,
  NotificationDocument,
  OrderDocument,
  OrderItemDocument,
  RecommendationDocument,
  ReservationDocument,
  RestaurantDocument,
  StaffDocument,
  TableDocument,
  UserDocument,
} from "./schema.js";
import { COLLECTIONS } from "./schema.js";

export const DEMO_PASSWORD = "Andhrimnir Demo 2026";

export const DEMO_IDS = {
  restaurant: "710000000000000000000001",
  manager: "710000000000000000000002",
  reception: "710000000000000000000003",
  kitchen: "710000000000000000000004",
  administrator: "710000000000000000000005",
  customerUser: "710000000000000000000006",
  customer: "710000000000000000000007",
  tableOne: "710000000000000000000008",
  tableTwo: "710000000000000000000009",
  tableThree: "71000000000000000000000a",
  tableFour: "71000000000000000000000b",
  menuMasalaDosa: "71000000000000000000000c",
  menuPaneerTikka: "71000000000000000000000d",
  menuFilterCoffee: "71000000000000000000000e",
  menuLemonRice: "71000000000000000000000f",
  inventoryPaneer: "710000000000000000000010",
  inventoryCoffee: "710000000000000000000011",
  inventoryRice: "710000000000000000000012",
  inventoryTomato: "710000000000000000000013",
  reservationOne: "710000000000000000000014",
  reservationTwo: "710000000000000000000015",
  orderOne: "710000000000000000000016",
  orderTwo: "710000000000000000000017",
  orderThree: "710000000000000000000018",
  orderItemOne: "710000000000000000000019",
  orderItemTwo: "71000000000000000000001a",
  orderItemThree: "71000000000000000000001b",
  incidentKitchen: "71000000000000000000001c",
  incidentInventory: "71000000000000000000001d",
  incidentReservation: "71000000000000000000001e",
  recommendationKitchen: "71000000000000000000001f",
  recommendationInventory: "710000000000000000000020",
  notificationOne: "710000000000000000000021",
  notificationTwo: "710000000000000000000022",
  notificationThree: "710000000000000000000023",
  billOne: "710000000000000000000024",
} as const;

export interface DemoSeedData {
  restaurants: Array<WithId<RestaurantDocument>>;
  users: Array<WithId<UserDocument>>;
  customers: Array<WithId<CustomerDocument>>;
  staff: Array<WithId<StaffDocument>>;
  menuItems: Array<WithId<MenuItemDocument>>;
  tables: Array<WithId<TableDocument>>;
  inventoryItems: Array<WithId<InventoryItemDocument>>;
  reservations: Array<WithId<ReservationDocument>>;
  orders: Array<WithId<OrderDocument>>;
  orderItems: Array<WithId<OrderItemDocument>>;
  incidents: Array<WithId<IncidentDocument>>;
  recommendations: Array<WithId<RecommendationDocument>>;
  notifications: Array<WithId<NotificationDocument>>;
  bills: Array<WithId<BillDocument>>;
}

const DEMO_SEED_COLLECTIONS: ReadonlyArray<readonly [string, keyof DemoSeedData]> = [
  [COLLECTIONS.restaurants, "restaurants"],
  [COLLECTIONS.users, "users"],
  [COLLECTIONS.customers, "customers"],
  [COLLECTIONS.staff, "staff"],
  [COLLECTIONS.menuItems, "menuItems"],
  [COLLECTIONS.tables, "tables"],
  [COLLECTIONS.inventoryItems, "inventoryItems"],
  [COLLECTIONS.reservations, "reservations"],
  [COLLECTIONS.orders, "orders"],
  [COLLECTIONS.orderItems, "orderItems"],
  [COLLECTIONS.incidents, "incidents"],
  [COLLECTIONS.recommendations, "recommendations"],
  [COLLECTIONS.notifications, "notifications"],
  [COLLECTIONS.bills, "bills"],
];

export const DEMO_SEED_COLLECTION_NAMES = DEMO_SEED_COLLECTIONS.map(
  ([collectionName]) => collectionName,
);

function id(hex: string): ObjectId {
  return new ObjectId(hex);
}

function withId<T extends Document>(
  objectId: ObjectId,
  fields: Omit<T, "_id" | "createdAt" | "updatedAt">,
  now: Date,
): WithId<T> {
  return { ...fields, _id: objectId, createdAt: now, updatedAt: now } as unknown as WithId<T>;
}

export function buildDemoSeedData(passwordHash: string, now = new Date()): DemoSeedData {
  const restaurantId = id(DEMO_IDS.restaurant);
  const managerId = id(DEMO_IDS.manager);
  const receptionId = id(DEMO_IDS.reception);
  const kitchenId = id(DEMO_IDS.kitchen);
  const administratorId = id(DEMO_IDS.administrator);
  const customerUserId = id(DEMO_IDS.customerUser);
  const customerId = id(DEMO_IDS.customer);
  const menuMasalaDosaId = id(DEMO_IDS.menuMasalaDosa);
  const menuPaneerTikkaId = id(DEMO_IDS.menuPaneerTikka);
  const menuCoffeeId = id(DEMO_IDS.menuFilterCoffee);
  const menuLemonRiceId = id(DEMO_IDS.menuLemonRice);
  const tableOneId = id(DEMO_IDS.tableOne);
  const tableTwoId = id(DEMO_IDS.tableTwo);
  const tableThreeId = id(DEMO_IDS.tableThree);
  const tableFourId = id(DEMO_IDS.tableFour);
  const managerPrincipal = (
    userId: ObjectId,
    role: "Manager" | "Reception" | "Kitchen Staff" | "Administrator",
  ) =>
    withId<UserDocument>(
      userId,
      {
        name:
          role === "Manager"
            ? "Maya Nair"
            : role === "Reception"
              ? "Arjun Iyer"
              : role === "Kitchen Staff"
                ? "Meera Das"
                : "Devika Rao",
        email: `${role.toLowerCase().replaceAll(" ", ".")}@saffronandco.demo`,
        normalizedEmail: `${role.toLowerCase().replaceAll(" ", ".")}@saffronandco.demo`,
        role,
        restaurantId,
        status: "active",
        authProvider: "email",
        passwordHash,
      },
      now,
    );

  return {
    restaurants: [
      withId<RestaurantDocument>(
        restaurantId,
        {
          name: "Saffron & Co.",
          contact: { email: "hello@saffronandco.demo", phone: "+91 44 5555 0101" },
          address: {
            line1: "14 East Coast Road",
            locality: "Adyar",
            city: "Chennai",
            region: "Tamil Nadu",
          },
          timezone: "Asia/Kolkata",
          currency: "INR",
          operatingHours: { opensAt: "11:00", closesAt: "23:00" },
          thresholds: {
            kitchenDelayWarningMinutes: 15,
            kitchenDelayCriticalMinutes: 25,
            orderDelayWarningMinutes: 20,
            orderDelayCriticalMinutes: 30,
            lowStockDefault: 5,
          },
          status: "active",
        },
        now,
      ),
    ],
    users: [
      managerPrincipal(managerId, "Manager"),
      managerPrincipal(receptionId, "Reception"),
      managerPrincipal(kitchenId, "Kitchen Staff"),
      managerPrincipal(administratorId, "Administrator"),
      withId<UserDocument>(
        id(DEMO_IDS.customerUser),
        {
          name: "Ananya Menon",
          email: "ananya@saffronandco.demo",
          normalizedEmail: "ananya@saffronandco.demo",
          role: "Customer",
          restaurantId: null,
          status: "active",
          authProvider: "email",
          passwordHash,
        },
        now,
      ),
    ],
    customers: [
      withId<CustomerDocument>(
        customerId,
        {
          userId: customerUserId,
          displayName: "Ananya Menon",
          email: "ananya@saffronandco.demo",
          phone: "+91 98765 43210",
          contactPreferences: { email: true, sms: false },
        },
        now,
      ),
    ],
    staff: [
      {
        ...withId<StaffDocument>(
          id(DEMO_IDS.manager),
          { restaurantId, userId: managerId, role: "Manager", isActive: true },
          now,
        ),
      },
      {
        ...withId<StaffDocument>(
          id(DEMO_IDS.reception),
          { restaurantId, userId: receptionId, role: "Reception", isActive: true },
          now,
        ),
      },
      {
        ...withId<StaffDocument>(
          id(DEMO_IDS.kitchen),
          { restaurantId, userId: kitchenId, role: "Kitchen Staff", isActive: true },
          now,
        ),
      },
      {
        ...withId<StaffDocument>(
          id(DEMO_IDS.administrator),
          { restaurantId, userId: administratorId, role: "Administrator", isActive: true },
          now,
        ),
      },
    ],
    menuItems: [
      withId<MenuItemDocument>(
        menuMasalaDosaId,
        {
          restaurantId,
          category: "South Indian",
          name: "Ghee podi dosa",
          description: "Crisp dosa, house podi, cultured butter, coconut chutney.",
          priceMinor: 28500,
          isAvailable: true,
          dietaryLabels: ["vegetarian"],
          allergenLabels: ["dairy"],
        },
        now,
      ),
      withId<MenuItemDocument>(
        menuPaneerTikkaId,
        {
          restaurantId,
          category: "Small plates",
          name: "Charred paneer tikka",
          description: "Tandoor-charred paneer, mint chutney, pickled onion.",
          priceMinor: 42500,
          isAvailable: true,
          dietaryLabels: ["vegetarian", "gluten-free"],
          allergenLabels: ["dairy"],
        },
        now,
      ),
      withId<MenuItemDocument>(
        menuCoffeeId,
        {
          restaurantId,
          category: "Drinks",
          name: "Madras filter coffee",
          description: "Single-origin chicory blend, poured from brass davara.",
          priceMinor: 9500,
          isAvailable: true,
          dietaryLabels: ["vegetarian"],
          allergenLabels: ["dairy"],
        },
        now,
      ),
      withId<MenuItemDocument>(
        menuLemonRiceId,
        {
          restaurantId,
          category: "Mains",
          name: "Curry leaf lemon rice",
          description: "Tempered rice, roasted peanuts, curry leaf and lime.",
          priceMinor: 26500,
          isAvailable: true,
          dietaryLabels: ["vegan", "gluten-free"],
          allergenLabels: ["peanuts"],
        },
        now,
      ),
    ],
    tables: [
      withId<TableDocument>(
        tableOneId,
        {
          restaurantId,
          tableNumber: "01",
          capacity: 2,
          zone: "Window",
          status: "occupied",
          currentOrderId: id(DEMO_IDS.orderOne),
        },
        now,
      ),
      withId<TableDocument>(
        tableTwoId,
        {
          restaurantId,
          tableNumber: "02",
          capacity: 4,
          zone: "Garden",
          status: "reserved",
          currentReservationId: id(DEMO_IDS.reservationOne),
        },
        now,
      ),
      withId<TableDocument>(
        tableThreeId,
        { restaurantId, tableNumber: "03", capacity: 4, zone: "Dining room", status: "available" },
        now,
      ),
      withId<TableDocument>(
        tableFourId,
        {
          restaurantId,
          tableNumber: "04",
          capacity: 6,
          zone: "Dining room",
          status: "occupied",
          currentOrderId: id(DEMO_IDS.orderTwo),
        },
        now,
      ),
    ],
    inventoryItems: [
      withId<InventoryItemDocument>(
        id(DEMO_IDS.inventoryPaneer),
        {
          restaurantId,
          name: "Paneer",
          quantity: 2.4,
          unit: "kg",
          lowStockThreshold: 4,
          lastAdjustedAt: new Date(now.getTime() - 18 * 60_000),
        },
        now,
      ),
      withId<InventoryItemDocument>(
        id(DEMO_IDS.inventoryCoffee),
        {
          restaurantId,
          name: "Filter coffee blend",
          quantity: 6.8,
          unit: "kg",
          lowStockThreshold: 3,
          lastAdjustedAt: new Date(now.getTime() - 42 * 60_000),
        },
        now,
      ),
      withId<InventoryItemDocument>(
        id(DEMO_IDS.inventoryRice),
        {
          restaurantId,
          name: "Ponni rice",
          quantity: 12,
          unit: "kg",
          lowStockThreshold: 8,
          lastAdjustedAt: new Date(now.getTime() - 2 * 60 * 60_000),
        },
        now,
      ),
      withId<InventoryItemDocument>(
        id(DEMO_IDS.inventoryTomato),
        {
          restaurantId,
          name: "Tomato",
          quantity: 8.1,
          unit: "kg",
          lowStockThreshold: 4,
          lastAdjustedAt: new Date(now.getTime() - 3 * 60 * 60_000),
        },
        now,
      ),
    ],
    reservations: [
      withId<ReservationDocument>(
        id(DEMO_IDS.reservationOne),
        {
          restaurantId,
          customerId,
          partySize: 4,
          startAt: new Date(now.getTime() + 45 * 60_000),
          endAt: new Date(now.getTime() + 105 * 60_000),
          tableId: tableTwoId,
          status: "Confirmed",
          notes: "Window-side seating, if possible.",
        },
        now,
      ),
      withId<ReservationDocument>(
        id(DEMO_IDS.reservationTwo),
        {
          restaurantId,
          customerId,
          partySize: 2,
          startAt: new Date(now.getTime() + 80 * 60_000),
          endAt: new Date(now.getTime() + 140 * 60_000),
          tableId: tableThreeId,
          status: "Confirmed",
        },
        now,
      ),
    ],
    orders: [
      withId<OrderDocument>(
        id(DEMO_IDS.orderOne),
        {
          restaurantId,
          customerId,
          tableId: tableOneId,
          totalMinor: 57000,
          currency: "INR",
          status: "Preparing",
          statusTimestamps: {
            Created: new Date(now.getTime() - 28 * 60_000),
            Accepted: new Date(now.getTime() - 25 * 60_000),
            Preparing: new Date(now.getTime() - 23 * 60_000),
          },
        },
        now,
      ),
      withId<OrderDocument>(
        id(DEMO_IDS.orderTwo),
        {
          restaurantId,
          customerId,
          tableId: tableFourId,
          totalMinor: 52000,
          currency: "INR",
          status: "Ready",
          statusTimestamps: {
            Created: new Date(now.getTime() - 15 * 60_000),
            Accepted: new Date(now.getTime() - 14 * 60_000),
            Preparing: new Date(now.getTime() - 12 * 60_000),
            Ready: new Date(now.getTime() - 2 * 60_000),
          },
        },
        now,
      ),
      withId<OrderDocument>(
        id(DEMO_IDS.orderThree),
        {
          restaurantId,
          customerId,
          totalMinor: 28500,
          currency: "INR",
          status: "Accepted",
          statusTimestamps: {
            Created: new Date(now.getTime() - 5 * 60_000),
            Accepted: new Date(now.getTime() - 4 * 60_000),
          },
        },
        now,
      ),
    ],
    orderItems: [
      withId<OrderItemDocument>(
        id(DEMO_IDS.orderItemOne),
        {
          restaurantId,
          orderId: id(DEMO_IDS.orderOne),
          menuItemId: menuMasalaDosaId,
          nameSnapshot: "Ghee podi dosa",
          unitPriceMinor: 28500,
          quantity: 2,
          preparationStatus: "Preparing",
        },
        now,
      ),
      withId<OrderItemDocument>(
        id(DEMO_IDS.orderItemTwo),
        {
          restaurantId,
          orderId: id(DEMO_IDS.orderTwo),
          menuItemId: menuPaneerTikkaId,
          nameSnapshot: "Charred paneer tikka",
          unitPriceMinor: 42500,
          quantity: 1,
          preparationStatus: "Ready",
        },
        now,
      ),
      withId<OrderItemDocument>(
        id(DEMO_IDS.orderItemThree),
        {
          restaurantId,
          orderId: id(DEMO_IDS.orderTwo),
          menuItemId: menuCoffeeId,
          nameSnapshot: "Madras filter coffee",
          unitPriceMinor: 9500,
          quantity: 1,
          preparationStatus: "Ready",
        },
        now,
      ),
    ],
    incidents: [
      withId<IncidentDocument>(
        id(DEMO_IDS.incidentKitchen),
        {
          restaurantId,
          type: "kitchen_delay",
          severity: "warning",
          status: "open",
          triggerSnapshot: {
            orderId: DEMO_IDS.orderOne,
            elapsedMinutes: 23,
            thresholdMinutes: 15,
            queueLength: 7,
          },
          affectedEntity: { type: "order", id: id(DEMO_IDS.orderOne) },
          rootCause:
            "The current preparation time is above the restaurant's 15-minute warning threshold.",
        },
        now,
      ),
      withId<IncidentDocument>(
        id(DEMO_IDS.incidentInventory),
        {
          restaurantId,
          type: "inventory_shortage",
          severity: "critical",
          status: "open",
          triggerSnapshot: {
            itemId: DEMO_IDS.inventoryPaneer,
            available: 2.4,
            lowStockThreshold: 4,
            unit: "kg",
          },
          affectedEntity: { type: "inventory_item", id: id(DEMO_IDS.inventoryPaneer) },
          rootCause: "Paneer stock is below the configured reorder threshold.",
        },
        now,
      ),
      withId<IncidentDocument>(
        id(DEMO_IDS.incidentReservation),
        {
          restaurantId,
          type: "reservation_conflict",
          severity: "info",
          status: "resolved",
          triggerSnapshot: {
            tableId: DEMO_IDS.tableThree,
            partySize: 2,
            startAt: new Date(now.getTime() + 80 * 60_000).toISOString(),
          },
          affectedEntity: { type: "reservation", id: id(DEMO_IDS.reservationTwo) },
          rootCause: "A reservation overlap was reviewed and cleared by the floor manager.",
        },
        now,
      ),
    ],
    recommendations: [
      withId<RecommendationDocument>(
        id(DEMO_IDS.recommendationKitchen),
        {
          restaurantId,
          incidentId: id(DEMO_IDS.incidentKitchen),
          summary: "The kitchen queue is stretching ticket times during the dinner ramp.",
          actions: [
            {
              description: "Move one cross-trained teammate to the hot line for 20 minutes.",
              rationale: "Seven active tickets are competing for the same station.",
              expectedImpact: "Bring the oldest ticket back toward the 15-minute target.",
            },
            {
              description: "Tell the floor team which two menu items are moving slowly.",
              rationale: "Accurate pacing sets expectations before the next order is placed.",
              expectedImpact: "Reduce avoidable table wait and re-fire risk.",
            },
          ],
          confidence: 0.82,
          provider: "demo",
        },
        now,
      ),
      withId<RecommendationDocument>(
        id(DEMO_IDS.recommendationInventory),
        {
          restaurantId,
          incidentId: id(DEMO_IDS.incidentInventory),
          summary: "Paneer is below its reorder point while dinner service is active.",
          actions: [
            {
              description: "Confirm the closing stock count and contact the approved supplier.",
              rationale: "The current count is 2.4 kg against a 4 kg threshold.",
              expectedImpact: "Protect availability for the remaining dinner covers.",
            },
          ],
          confidence: 0.94,
          provider: "demo",
        },
        now,
      ),
    ],
    notifications: [
      withId<NotificationDocument>(
        id(DEMO_IDS.notificationOne),
        {
          restaurantId,
          recipientUserId: managerId,
          type: "incident.critical",
          title: "Paneer stock is running low",
          body: "2.4 kg on hand — below the 4 kg reorder point.",
          relatedEntity: { type: "incident", id: id(DEMO_IDS.incidentInventory) },
          deliveredAt: new Date(now.getTime() - 3 * 60_000),
          readAt: null,
        },
        now,
      ),
      withId<NotificationDocument>(
        id(DEMO_IDS.notificationTwo),
        {
          restaurantId,
          recipientUserId: managerId,
          type: "incident.warning",
          title: "Kitchen ticket time is trending up",
          body: "Order #DS-1042 has been preparing for 23 minutes.",
          relatedEntity: { type: "incident", id: id(DEMO_IDS.incidentKitchen) },
          deliveredAt: new Date(now.getTime() - 4 * 60_000),
        },
        now,
      ),
      withId<NotificationDocument>(
        id(DEMO_IDS.notificationThree),
        {
          restaurantId,
          recipientUserId: receptionId,
          type: "reservation.created",
          title: "New reservation for four",
          body: "Ananya Menon · today at 7:30 PM.",
          relatedEntity: { type: "reservation", id: id(DEMO_IDS.reservationOne) },
          deliveredAt: new Date(now.getTime() - 8 * 60_000),
          readAt: new Date(now.getTime() - 5 * 60_000),
        },
        now,
      ),
    ],
    bills: [
      withId<BillDocument>(
        id(DEMO_IDS.billOne),
        {
          restaurantId,
          orderId: id(DEMO_IDS.orderTwo),
          lineItems: [
            { nameSnapshot: "Charred paneer tikka", quantity: 1, unitPriceMinor: 42500 },
            { nameSnapshot: "Madras filter coffee", quantity: 1, unitPriceMinor: 9500 },
          ],
          subtotalMinor: 52000,
          taxMinor: 0,
          adjustmentsMinor: 0,
          totalMinor: 52000,
          currency: "INR",
          status: "issued",
        },
        now,
      ),
    ],
  };
}

export async function seedDevelopmentData(
  db: import("mongodb").Db,
  passwordHash: string,
  now = new Date(),
): Promise<void> {
  const data = buildDemoSeedData(passwordHash, now);
  for (const [collectionName, dataKey] of DEMO_SEED_COLLECTIONS) {
    const collection = db.collection(collectionName);
    for (const document of data[dataKey]) {
      await collection.replaceOne({ _id: document._id }, document, { upsert: true });
    }
  }
}
