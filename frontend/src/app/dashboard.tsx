"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnalyticsPage } from "./_dashboard/analytics-page";
import { CustomerPortal } from "./_dashboard/customer-portal";
import {
  API_BASE,
  DEMO_INCIDENTS,
  DEMO_RECOMMENDATION,
  INCIDENT_INVENTORY_ID,
  INITIAL_INVENTORY,
  INITIAL_ORDERS,
  INITIAL_RESERVATIONS,
  NAVIGATION,
} from "./_dashboard/demo-data";
import { FloorPanel } from "./_dashboard/floor-panel";
import { IncidentsPage } from "./_dashboard/incidents-page";
import { InsightsPage } from "./_dashboard/insights-page";
import { InventoryPage } from "./_dashboard/inventory-page";
import { OverviewPage } from "./_dashboard/overview-page";
import {
  displayOrderId,
  isHealthScoreData,
  kitchenTicketFromOrder,
  parseInventoryResponse,
  parseInventoryUpdate,
  parseKitchenQueueResponse,
  parseReservationResponse,
  parseReservationsResponse,
  parseStaffOrderListResponse,
  parseStaffOrderResponse,
} from "./_dashboard/parsers";
import { ReservationsPage } from "./_dashboard/reservations-page";
import { KitchenPage, OrdersPage } from "./_dashboard/service-pages";
import { SettingsPage } from "./_dashboard/settings-page";
import type {
  HealthScoreData,
  HealthScoreViewStatus,
  IncidentViewStatus,
  InventoryItem,
  InventoryViewStatus,
  KitchenTicket,
  Order,
  OrderFeedStatus,
  OrderStatus,
  RecommendationViewStatus,
  ReservationStatus,
  ReservationViewStatus,
  Section,
} from "./_dashboard/types";
import { DemoBanner, Icon, PageHeading } from "./_dashboard/ui";
import { classifyRequestError, DEFAULT_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "./api-client";
import { useAuth } from "./auth-provider";
import { BrandMark } from "./brand-mark";
import {
  canAccessDashboardSection,
  canViewHealthScore,
  canViewIncidents,
  canViewRecommendations,
  dashboardWorkspaceScopeKey,
  navigationForRole,
  resolveDashboardSection,
  valueForDashboardWorkspace,
} from "./dashboard-access";
import { parseIncidentsResponse } from "./incident-data";
import { NotificationBell } from "./notifications/notification-bell";
import { useNotifications } from "./notifications/use-notifications";
import { refreshTargetsForEvent } from "./realtime-client";
import {
  parseGeneratedRecommendationResponse,
  parseRecommendationsResponse,
} from "./recommendation-data";

export function Dashboard() {
  const { user, accessToken, signOut } = useAuth();
  const [section, setSection] = useState<Section>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoBannerVisible, setDemoBannerVisible] = useState(true);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Several panels can time out at once, so the hint is a single shared state.
  const [slowDataNoticeVisible, setSlowDataNoticeVisible] = useState(false);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [ordersStatus, setOrdersStatus] = useState<OrderFeedStatus>("preview");
  const [ordersTruncated, setOrdersTruncated] = useState(false);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [kitchenTickets, setKitchenTickets] = useState<KitchenTicket[]>([]);
  const [kitchenQueueStatus, setKitchenQueueStatus] = useState<OrderFeedStatus>("preview");
  const [kitchenQueueTruncated, setKitchenQueueTruncated] = useState(false);
  const [kitchenQueueRefreshKey, setKitchenQueueRefreshKey] = useState(0);
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryViewStatus>("preview");
  const [inventoryTruncated, setInventoryTruncated] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [reservations, setReservations] = useState(INITIAL_RESERVATIONS);
  const [reservationsStatus, setReservationsStatus] = useState<ReservationViewStatus>("preview");
  const [reservationsTruncated, setReservationsTruncated] = useState(false);
  const [reservationsRefreshKey, setReservationsRefreshKey] = useState(0);
  const [savingReservationId, setSavingReservationId] = useState("");
  const [incidents, setIncidents] = useState(DEMO_INCIDENTS);
  const [incidentScopeKey, setIncidentScopeKey] = useState("preview");
  const [incidentViewStatus, setIncidentViewStatus] = useState<IncidentViewStatus>("preview");
  const [incidentTruncated, setIncidentTruncated] = useState(false);
  const [incidentRefreshKey, setIncidentRefreshKey] = useState(0);
  const [recommendation, setRecommendation] = useState(DEMO_RECOMMENDATION);
  const [recommendationScopeKey, setRecommendationScopeKey] = useState("preview");
  const [recommendationReviewed, setRecommendationReviewed] = useState(false);
  const [recommendationViewStatus, setRecommendationViewStatus] =
    useState<RecommendationViewStatus>("preview");
  const [generating, setGenerating] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All orders");
  const [healthScore, setHealthScore] = useState<HealthScoreData | null>(null);
  const [healthScoreError, setHealthScoreError] = useState("");
  const [healthScoreLoading, setHealthScoreLoading] = useState(false);
  const [healthScoreRefreshKey, setHealthScoreRefreshKey] = useState(0);
  // Live restaurant events (S2-13) refetch only the panels whose data changed.
  const notificationFeed = useNotifications(accessToken, (envelope) => {
    const bump = (current: number) => current + 1;
    for (const target of refreshTargetsForEvent(envelope.event)) {
      if (target === "orders") setOrdersRefreshKey(bump);
      if (target === "kitchen") setKitchenQueueRefreshKey(bump);
      if (target === "inventory") setInventoryRefreshKey(bump);
      if (target === "reservations") setReservationsRefreshKey(bump);
      if (target === "incidents") setIncidentRefreshKey(bump);
      if (target === "healthScore") setHealthScoreRefreshKey(bump);
    }
  });
  const role = user?.role;
  const workspaceScopeKey = dashboardWorkspaceScopeKey(user);
  const currentRecommendation = valueForDashboardWorkspace(
    recommendation,
    recommendationScopeKey,
    workspaceScopeKey,
    DEMO_RECOMMENDATION,
  );
  const currentRecommendationReviewed = valueForDashboardWorkspace(
    recommendationReviewed,
    recommendationScopeKey,
    workspaceScopeKey,
    false,
  );
  const currentRecommendationStatus =
    recommendationScopeKey === workspaceScopeKey
      ? recommendationViewStatus
      : accessToken && role && canViewRecommendations(role)
        ? "loading"
        : "preview";
  const incidentScopeMatches = incidentScopeKey === workspaceScopeKey;
  const currentIncidents = incidentScopeMatches
    ? incidents
    : accessToken && role && canViewIncidents(role)
      ? []
      : DEMO_INCIDENTS;
  const currentIncidentStatus: IncidentViewStatus = incidentScopeMatches
    ? incidentViewStatus
    : accessToken && role
      ? canViewIncidents(role)
        ? "loading"
        : "restricted"
      : "preview";
  const currentIncidentTruncated = incidentScopeMatches && incidentTruncated;
  const currentRecommendationIncident = currentIncidents.find(
    (incident) => incident.id.toLowerCase() === currentRecommendation.incidentId.toLowerCase(),
  );
  const currentOpenIncidentCount =
    currentIncidentStatus === "live" ||
    currentIncidentStatus === "empty" ||
    currentIncidentStatus === "preview"
      ? currentIncidents.filter(
          (incident) => incident.status === "open" || incident.status === "active",
        ).length
      : null;

  useEffect(() => {
    if (recommendationScopeKey === workspaceScopeKey) return;
    setRecommendation(DEMO_RECOMMENDATION);
    setRecommendationReviewed(false);
    setRecommendationScopeKey(workspaceScopeKey);
  }, [recommendationScopeKey, workspaceScopeKey]);

  useEffect(() => {
    if (!accessToken || !role || !canViewRecommendations(role)) {
      setRecommendation(DEMO_RECOMMENDATION);
      setRecommendationReviewed(false);
      setRecommendationScopeKey(workspaceScopeKey);
      setRecommendationViewStatus("preview");
      return;
    }

    const controller = new AbortController();
    setRecommendation(DEMO_RECOMMENDATION);
    setRecommendationReviewed(false);
    setRecommendationScopeKey(workspaceScopeKey);
    setRecommendationViewStatus("loading");
    void fetchWithTimeout(
      `${API_BASE}/recommendations?incidentId=${encodeURIComponent(INCIDENT_INVENTORY_ID)}`,
      {
        cache: "no-store",
        credentials: "include",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 403) {
          setRecommendationViewStatus("restricted");
          return;
        }
        if (!response.ok) throw new Error("Saved recommendations are not available from the API.");
        const parsed = parseRecommendationsResponse(await response.json(), INCIDENT_INVENTORY_ID);
        if (!parsed.valid) throw new Error("The recommendation response was invalid.");
        if (controller.signal.aborted) return;
        if (!parsed.recommendation) {
          setRecommendationViewStatus("empty");
          return;
        }
        setRecommendation(parsed.recommendation);
        setRecommendationViewStatus("live");
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendationViewStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, workspaceScopeKey]);

  useEffect(() => {
    if (!accessToken || !role) {
      setIncidents(DEMO_INCIDENTS);
      setIncidentTruncated(false);
      setIncidentScopeKey(workspaceScopeKey);
      setIncidentViewStatus("preview");
      return;
    }

    if (!canViewIncidents(role)) {
      setIncidents([]);
      setIncidentTruncated(false);
      setIncidentScopeKey(workspaceScopeKey);
      setIncidentViewStatus("restricted");
      return;
    }

    const controller = new AbortController();
    setIncidents([]);
    setIncidentTruncated(false);
    setIncidentScopeKey(workspaceScopeKey);
    setIncidentViewStatus("loading");
    void fetchWithTimeout(`${API_BASE}/incidents`, {
      cache: incidentRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setIncidentViewStatus("restricted");
          return;
        }
        if (!response.ok) throw new Error("Incidents are not available from the API.");
        const parsed = parseIncidentsResponse(await response.json());
        if (!parsed) throw new Error("The incident response was invalid.");
        if (controller.signal.aborted) return;
        setIncidents(parsed.incidents);
        setIncidentTruncated(parsed.truncated);
        setIncidentViewStatus(parsed.incidents.length === 0 ? "empty" : "live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setIncidents([]);
        setIncidentTruncated(false);
        setIncidentViewStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, workspaceScopeKey, incidentRefreshKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer") {
      setOrders(INITIAL_ORDERS);
      setOrdersStatus("preview");
      setOrdersTruncated(false);
      return;
    }

    const controller = new AbortController();
    setOrders([]);
    setOrdersTruncated(false);
    setOrdersStatus("loading");
    void fetchWithTimeout(`${API_BASE}/orders`, {
      cache: ordersRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Orders are not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseStaffOrderListResponse(payload);
        if (!parsed) throw new Error("The staff order response was invalid.");
        if (controller.signal.aborted) return;
        setOrders(parsed.orders);
        setOrdersTruncated(parsed.truncated);
        setOrdersStatus("live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setOrders([]);
        setOrdersTruncated(false);
        setOrdersStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, ordersRefreshKey]);

  useEffect(() => {
    if (
      !accessToken ||
      (role !== "Kitchen Staff" && role !== "Manager" && role !== "Administrator")
    ) {
      setKitchenTickets([]);
      setKitchenQueueStatus("preview");
      setKitchenQueueTruncated(false);
      return;
    }

    const controller = new AbortController();
    setKitchenTickets([]);
    setKitchenQueueTruncated(false);
    setKitchenQueueStatus("loading");
    void fetchWithTimeout(`${API_BASE}/kitchen/queue`, {
      cache: kitchenQueueRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The kitchen queue is not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseKitchenQueueResponse(payload);
        if (!parsed) throw new Error("The kitchen queue response was invalid.");
        if (controller.signal.aborted) return;
        setKitchenTickets(parsed.tickets);
        setKitchenQueueTruncated(parsed.truncated);
        setKitchenQueueStatus("live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setKitchenTickets([]);
        setKitchenQueueTruncated(false);
        setKitchenQueueStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, kitchenQueueRefreshKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer") {
      setInventory(INITIAL_INVENTORY);
      setInventoryStatus("preview");
      setInventoryTruncated(false);
      return;
    }

    const controller = new AbortController();
    setInventory([]);
    setInventoryTruncated(false);
    setInventoryStatus("loading");
    void fetchWithTimeout(`${API_BASE}/inventory`, {
      cache: inventoryRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Inventory is not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseInventoryResponse(payload);
        if (!parsed) throw new Error("The inventory response was invalid.");
        if (controller.signal.aborted) return;
        setInventory(parsed.items);
        setInventoryTruncated(parsed.truncated);
        setInventoryStatus("live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setInventory([]);
        setInventoryTruncated(false);
        setInventoryStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, inventoryRefreshKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer" || role === "Kitchen Staff") {
      setReservations(INITIAL_RESERVATIONS);
      setReservationsStatus("preview");
      setReservationsTruncated(false);
      return;
    }

    const controller = new AbortController();
    setReservations([]);
    setReservationsTruncated(false);
    setReservationsStatus("loading");
    void fetchWithTimeout(`${API_BASE}/reservations`, {
      cache: reservationsRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reservations are not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseReservationsResponse(payload);
        if (!parsed) throw new Error("The reservation response was invalid.");
        if (controller.signal.aborted) return;
        setReservations(parsed.reservations);
        setReservationsTruncated(parsed.truncated);
        setReservationsStatus("live");
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setReservations([]);
        setReservationsTruncated(false);
        setReservationsStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, reservationsRefreshKey]);

  useEffect(() => {
    if (!accessToken || !canViewHealthScore(role)) {
      setHealthScore(null);
      setHealthScoreError("");
      setHealthScoreLoading(false);
      return;
    }

    const controller = new AbortController();
    setHealthScore(null);
    setHealthScoreLoading(true);
    setHealthScoreError("");

    void fetchWithTimeout(`${API_BASE}/healthscore`, {
      cache: healthScoreRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Your role cannot view the health score."
              : "The health-score service is unavailable.",
          );
        }
        const payload: unknown = await response.json();
        if (!isHealthScoreData(payload)) throw new Error("The health-score response was invalid.");
        setHealthScore(payload);
      })
      .catch((error: unknown) => {
        if (classifyRequestError(error) === "abort") return;
        if (classifyRequestError(error) === "timeout") setSlowDataNoticeVisible(true);
        setHealthScore(null);
        setHealthScoreError(
          error instanceof Error ? error.message : "The health-score service is unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setHealthScoreLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, role, healthScoreRefreshKey]);

  const availableNav = navigationForRole(NAVIGATION, role);
  const currentSection = resolveDashboardSection(NAVIGATION, role, section) as Section;

  useEffect(() => {
    if (section !== currentSection) setSection(currentSection);
  }, [currentSection, section]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const canUpdateOrderHeaders =
    role === "Reception" || role === "Manager" || role === "Administrator";

  const advanceOrder = async (id: string) => {
    const currentOrder = orders.find((order) => order.id === id);
    if (!currentOrder) return;

    if (ordersStatus === "live") {
      if (!accessToken || !canUpdateOrderHeaders) {
        notify("Your role cannot update this order header.");
        return;
      }
      const requestedStatus =
        currentOrder.status === "New"
          ? "Accepted"
          : currentOrder.status === "Ready"
            ? "Served"
            : currentOrder.status === "Served"
              ? "Completed"
              : null;
      if (!requestedStatus) {
        notify("Preparation progress is managed item-by-item in the kitchen queue.");
        return;
      }
      try {
        const response = await fetchWithTimeout(`${API_BASE}/orders/${currentOrder.id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: requestedStatus }),
        });
        if (!response.ok) {
          setOrdersRefreshKey((current) => current + 1);
          setKitchenQueueRefreshKey((current) => current + 1);
          notify(
            response.status === 409
              ? "The order changed. Refresh the feed and try again."
              : "The order update was not saved. Check your permissions and connection.",
          );
          return;
        }
        const updated = parseStaffOrderResponse(await response.json());
        const expectedViewStatus: OrderStatus =
          requestedStatus === "Accepted"
            ? "Accepted"
            : requestedStatus === "Served"
              ? "Served"
              : "Completed";
        if (!updated || updated.id !== id || updated.status !== expectedViewStatus) {
          setOrdersRefreshKey((current) => current + 1);
          notify("The API saved an update but returned an invalid order. The feed is refreshing.");
          return;
        }
        setOrders((current) =>
          updated.status === "Completed"
            ? current.filter((order) => order.id !== id)
            : current.map((order) => (order.id === id ? updated : order)),
        );
        setKitchenQueueRefreshKey((current) => current + 1);
        notify(`${displayOrderId(id)} moved to ${requestedStatus.toLowerCase()} and was saved.`);
      } catch {
        setOrdersRefreshKey((current) => current + 1);
        notify("Orders are unavailable; the status update was not saved.");
      }
      return;
    }

    const nextStatus: OrderStatus | null =
      currentOrder.status === "New"
        ? "Accepted"
        : currentOrder.status === "Accepted"
          ? "Preparing"
          : currentOrder.status === "Preparing"
            ? "Ready"
            : currentOrder.status === "Ready"
              ? "Served"
              : null;
    if (nextStatus) {
      setOrders((current) =>
        current.map((order) => (order.id === id ? { ...order, status: nextStatus } : order)),
      );
      notify(
        `${displayOrderId(id)} moved to ${nextStatus.toLowerCase()} in this preview; it was not saved.`,
      );
    }
  };

  const advanceKitchenItem = async (orderId: string, itemId: string) => {
    if (kitchenQueueStatus !== "live") {
      await advanceOrder(orderId);
      return;
    }
    if (!accessToken) {
      notify("Sign in again before updating a kitchen item.");
      return;
    }
    const ticket = kitchenTickets.find((current) => current.id === orderId);
    const item = ticket?.items.find((current) => current.id === itemId);
    if (!ticket || !item) {
      notify("The kitchen item is no longer in this queue. Refresh and try again.");
      setKitchenQueueRefreshKey((current) => current + 1);
      return;
    }
    const preparationStatus =
      item.preparationStatus === "Created"
        ? "Preparing"
        : item.preparationStatus === "Preparing"
          ? "Ready"
          : null;
    if (!preparationStatus) return;

    try {
      const response = await fetchWithTimeout(`${API_BASE}/kitchen/queue/${orderId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ itemId, preparationStatus }),
      });
      if (!response.ok) {
        setKitchenQueueRefreshKey((current) => current + 1);
        notify(
          response.status === 409
            ? "The item changed. The kitchen queue is refreshing."
            : "The preparation update was not saved. Check your permissions and connection.",
        );
        return;
      }
      const updated = parseStaffOrderResponse(await response.json());
      if (!updated || updated.id !== orderId) {
        setKitchenQueueRefreshKey((current) => current + 1);
        notify("The API saved an update but returned an invalid order. The queue is refreshing.");
        return;
      }
      setOrders((current) => current.map((order) => (order.id === orderId ? updated : order)));
      const updatedTicket = kitchenTicketFromOrder(updated);
      setKitchenTickets((current) =>
        updatedTicket
          ? current.map((currentTicket) =>
              currentTicket.id === orderId ? updatedTicket : currentTicket,
            )
          : current.filter((currentTicket) => currentTicket.id !== orderId),
      );
      notify(`${item.name} moved to ${preparationStatus.toLowerCase()} and was saved.`);
    } catch {
      setKitchenQueueRefreshKey((current) => current + 1);
      notify("The kitchen queue is unavailable; the item update was not saved.");
    }
  };

  const addStock = async (item: InventoryItem, quantity: number): Promise<boolean> => {
    const liveManager =
      accessToken && inventoryStatus === "live" && (role === "Manager" || role === "Administrator");

    if (liveManager) {
      if (!item.id) {
        notify("This inventory item cannot be identified; the count was not saved.");
        return false;
      }
      try {
        const response = await fetchWithTimeout(`${API_BASE}/inventory/${item.id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ quantity, lowStockThreshold: item.minimum }),
        });
        if (!response.ok) {
          notify("The stock count was not saved. Check your permissions and connection.");
          return false;
        }
        const updated = parseInventoryUpdate(await response.json());
        if (!updated) {
          notify("The inventory response was invalid; the count was not saved.");
          return false;
        }
        setInventory((current) =>
          current.map((currentItem) => (currentItem.id === updated.id ? updated : currentItem)),
        );
        notify(`${item.name} stock count saved.`);
        return true;
      } catch {
        notify("Inventory is unavailable; the stock count was not saved.");
        return false;
      }
    }

    setInventory((current) =>
      current.map((currentItem) => {
        const matches = item.id ? currentItem.id === item.id : currentItem.name === item.name;
        return matches ? { ...currentItem, onHand: quantity } : currentItem;
      }),
    );
    notify(`${item.name} count changed in this preview; it was not saved.`);
    return true;
  };

  const updateReservation = async (id: string) => {
    const current = reservations.find((reservation) => reservation.id === id);
    if (!current) return;
    const next: ReservationStatus | null =
      current.status === "Awaiting"
        ? "Confirmed"
        : current.status === "Confirmed"
          ? "Seated"
          : current.status === "Seated"
            ? "Completed"
            : null;
    if (!next) return;

    if (reservationsStatus === "live" && accessToken) {
      setSavingReservationId(id);
      try {
        const response = await fetchWithTimeout(`${API_BASE}/reservations/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: next }),
        });
        if (!response.ok) {
          notify("The reservation was not updated. Refresh and check your permissions.");
          return;
        }
        const updated = parseReservationResponse(await response.json());
        if (!updated) {
          notify("The reservation response was invalid; no local change was made.");
          return;
        }
        setReservations((currentReservations) =>
          currentReservations.map((item) => (item.id === id ? updated : item)),
        );
        notify(`Reservation marked ${next.toLowerCase()}.`);
      } catch {
        notify("Reservations are unavailable; the status was not changed.");
      } finally {
        setSavingReservationId("");
      }
      return;
    }

    setReservations((currentReservations) =>
      currentReservations.map((item) => (item.id === id ? { ...item, status: next } : item)),
    );
    notify(`${id} changed in this preview only; the API did not save it.`);
  };

  const generateRecommendation = async () => {
    setGenerating(true);
    try {
      if (!accessToken) {
        setRecommendation({ ...DEMO_RECOMMENDATION, source: "demo" });
        setRecommendationScopeKey(workspaceScopeKey);
        setRecommendationViewStatus("preview");
        notify(
          "Preview guidance refreshed. Sign in as a manager and connect the API for live recommendations.",
        );
        return;
      }
      const response = await fetchWithTimeout(
        `${API_BASE}/incidents/${INCIDENT_INVENTORY_ID}/recommendations`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Your role cannot generate recommendations."
            : "The live recommendation service is not available yet.",
        );
      }
      const recommendation = parseGeneratedRecommendationResponse(
        await response.json(),
        INCIDENT_INVENTORY_ID,
      );
      if (!recommendation) throw new Error("The recommendation response was invalid.");
      setRecommendation(recommendation);
      setRecommendationScopeKey(workspaceScopeKey);
      setRecommendationReviewed(false);
      setRecommendationViewStatus("live");
      notify(
        recommendation.source === "gemini"
          ? "A new AI recommendation is ready."
          : recommendation.source === "fallback"
            ? "A safe fallback recommendation is ready."
            : "The seeded preview recommendation is ready.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Live recommendations are unavailable.";
      notify(`${message} Keeping the current recommendation on screen.`);
    } finally {
      setGenerating(false);
    }
  };

  const goTo = (next: Section) => {
    if (!canAccessDashboardSection(NAVIGATION, role, next)) {
      setSection("Overview");
      setMobileMenuOpen(false);
      return;
    }
    setSection(next);
    setMobileMenuOpen(false);
  };

  const signOutAndNotify = async () => {
    await signOut();
    notify("You are signed out. The sample workspace is available at /dashboard.");
  };

  if (user?.role === "Customer") {
    return <CustomerPortal userName={user.name} accessToken={accessToken} onSignOut={signOut} />;
  }

  const greetingName = user?.name.split(" ")[0] ?? "Maya";
  const isDemo = !user;
  const canManageInventory = !role || role === "Manager" || role === "Administrator";
  const canViewCommercialData = !role || role === "Manager" || role === "Administrator";
  const canUseInsights = canViewRecommendations(role);
  const healthScoreStatus: HealthScoreViewStatus = !user
    ? "demo"
    : !canViewHealthScore(role)
      ? "restricted"
      : healthScoreLoading
        ? "loading"
        : healthScore
          ? "live"
          : healthScoreError
            ? "unavailable"
            : "loading";
  const headingBySection: Record<Section, { eyebrow: string; title: string; description: string }> =
    {
      Overview: {
        eyebrow: "SATURDAY · 10 OCTOBER 2026",
        title: `Good evening, ${greetingName}.`,
        description: "Here’s the rhythm of your restaurant, at a glance.",
      },
      Orders: {
        eyebrow: "SERVICE WORKSPACE",
        title: "Orders",
        description: "Keep every ticket moving from first touch to final plate.",
      },
      Kitchen: {
        eyebrow: "SERVICE WORKSPACE",
        title: "Kitchen display",
        description: "A calmer pass starts with a clear view of what’s cooking.",
      },
      Reservations: {
        eyebrow: "GUEST EXPERIENCE",
        title: "Reservations",
        description: "Know who’s coming in, and make every arrival feel expected.",
      },
      Inventory: {
        eyebrow: "OPERATIONS",
        title: "Inventory",
        description: "A live-looking snapshot of what’s on hand and what needs attention.",
      },
      Incidents: {
        eyebrow: "OPERATIONS",
        title: "Incidents",
        description: "Spot service risks early and keep a clear record of what happened.",
      },
      Insights: {
        eyebrow: "DINESMART ASSIST",
        title: "Better calls, made earlier.",
        description: "Practical, explainable recommendations grounded in your service context.",
      },
      Analytics: {
        eyebrow: "PERFORMANCE",
        title: "Service analytics",
        description: "A simple read on the trends shaping your week.",
      },
      Settings: {
        eyebrow: "WORKSPACE",
        title: "Settings & connections",
        description: "Your workspace, access, and service connections in one place.",
      },
    };
  const pageMeta = headingBySection[currentSection];

  return (
    <div className="app-shell">
      {mobileMenuOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside
        className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <BrandMark />
          <div className="brand-wordmark">
            <span>DineSmart</span>
            <small>RESTAURANT OS</small>
          </div>
          <button
            className="mobile-close icon-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <button
          className="restaurant-switcher"
          type="button"
          onClick={() =>
            notify("Restaurant switching will be available when a live workspace is connected.")
          }
        >
          <span className="restaurant-avatar">S</span>
          <span className="restaurant-switch-copy">
            <strong>Saffron &amp; Co.</strong>
            <small>Adyar · Chennai</small>
          </span>
          <Icon name="chevron" size={16} className="switch-chevron" />
        </button>
        <nav className="sidebar-nav" aria-label="Workspace">
          <span className="nav-caption">WORKSPACE</span>
          {availableNav.map((item, index) => (
            <div key={item.label}>
              {item.group === "manage" &&
              (index === 0 || availableNav[index - 1]?.group !== "manage") ? (
                <span className="nav-caption nav-caption-spaced">MANAGE</span>
              ) : null}
              <button
                type="button"
                className={`nav-item ${currentSection === item.label ? "nav-item-active" : ""}`}
                onClick={() => goTo(item.label)}
                aria-current={currentSection === item.label ? "page" : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.label === "Orders" ? (
                  <span className="nav-count">18</span>
                ) : item.label === "Incidents" &&
                  currentOpenIncidentCount !== null &&
                  (currentOpenIncidentCount > 0 || currentIncidentTruncated) ? (
                  <span
                    className="nav-alert-dot"
                    role="img"
                    aria-label={
                      currentIncidentTruncated && currentOpenIncidentCount === 0
                        ? "Incident history is partial; open count may be incomplete"
                        : `${currentIncidentStatus === "preview" ? "Sample preview: " : ""}${currentOpenIncidentCount} open incident${currentOpenIncidentCount === 1 ? "" : "s"}`
                    }
                    title={
                      currentIncidentTruncated && currentOpenIncidentCount === 0
                        ? "Incident history is partial"
                        : `${currentOpenIncidentCount} open incident${currentOpenIncidentCount === 1 ? "" : "s"}`
                    }
                  />
                ) : null}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {canUseInsights ? (
            <div className="sidebar-tip">
              <span className="tip-star">
                <Icon name="spark" size={16} />
              </span>
              <strong>A little more in sync.</strong>
              <p>Connect your operations to see insights shaped around your service.</p>
              <button type="button" onClick={() => goTo("Insights")}>
                Explore insights <Icon name="arrow-right" size={14} />
              </button>
            </div>
          ) : null}
          <div className="sidebar-profile">
            <span className="profile-avatar">
              {user
                ? user.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "MN"}
            </span>
            <span className="profile-copy">
              <strong>{user?.name ?? "Maya Nair"}</strong>
              <small>{user?.role ?? "Manager · Preview"}</small>
            </span>
            {user ? (
              <button
                className="profile-action"
                type="button"
                aria-label="Sign out"
                onClick={() => void signOutAndNotify()}
                title="Sign out"
              >
                <Icon name="logout" size={17} />
              </button>
            ) : (
              <Link className="profile-action" href="/login" aria-label="Sign in" title="Sign in">
                <Icon name="arrow-right" size={17} />
              </Link>
            )}
          </div>
        </div>
      </aside>

      <main className="workspace-main" id="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button icon-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="topbar-crumb">
              SAFFRON &amp; CO. <span>/</span> <strong>{currentSection}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-pill ${isDemo ? "connection-demo" : "connection-preview"}`}
            >
              <span />
              {isDemo ? "Preview mode" : "Signed-in preview"}
            </span>
            <NotificationBell
              feed={user ? notificationFeed : null}
              onViewActivity={() =>
                goTo(
                  canUseInsights
                    ? "Incidents"
                    : user?.role === "Reception"
                      ? "Orders"
                      : "Inventory",
                )
              }
            />
            <span className="topbar-divider" />
            <div className="topbar-date">
              <Icon name="sun" size={16} />
              <span>Evening service</span>
            </div>
          </div>
        </header>

        <div className="page-content">
          <PageHeading
            eyebrow={pageMeta.eyebrow}
            title={pageMeta.title}
            description={pageMeta.description}
          >
            {currentSection === "Overview" ? (
              <>
                {canViewCommercialData ? (
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => notify("A preview service report has been prepared.")}
                  >
                    <Icon name="download" size={16} />
                    <span>Export</span>
                  </button>
                ) : null}
                {role !== "Kitchen Staff" ? (
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={() => {
                      goTo("Orders");
                      notify("You’re viewing the sample order queue.");
                    }}
                  >
                    <Icon name="plus" size={16} />
                    <span>New order</span>
                  </button>
                ) : null}
              </>
            ) : currentSection === "Orders" ? (
              <>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setOrderStatusFilter("All orders")}
                >
                  <Icon name="filter" size={16} />
                  Filters
                </button>
                {role !== "Kitchen Staff" ? (
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={() =>
                      notify("Order creation is available when your live POS is connected.")
                    }
                  >
                    <Icon name="plus" size={16} />
                    New order
                  </button>
                ) : null}
              </>
            ) : currentSection === "Incidents" ? (
              <button
                type="button"
                className="button button-outline"
                disabled={currentIncidentStatus === "loading"}
                onClick={() => setIncidentRefreshKey((current) => current + 1)}
              >
                <Icon name="refresh" size={16} />
                {currentIncidentStatus === "loading" ? "Loading…" : "Refresh incidents"}
              </button>
            ) : currentSection === "Insights" ? (
              <button
                type="button"
                className="button button-dark"
                disabled={generating || currentRecommendationStatus === "loading"}
                onClick={() => void generateRecommendation()}
              >
                <Icon name="spark" size={16} />
                {generating
                  ? "Generating…"
                  : currentRecommendationStatus === "loading"
                    ? "Loading…"
                    : "Generate insight"}
              </button>
            ) : null}
          </PageHeading>

          {demoBannerVisible ? (
            <DemoBanner
              onDismiss={() => setDemoBannerVisible(false)}
              inventoryStatus={inventoryStatus}
              reservationsStatus={reservationsStatus}
              ordersStatus={ordersStatus}
              kitchenQueueStatus={kitchenQueueStatus}
              canManageInventory={canManageInventory}
            />
          ) : null}

          {slowDataNoticeVisible ? (
            <div className="demo-banner" role="status">
              <span className="demo-banner-icon">
                <Icon name="clock" size={16} />
              </span>
              <div>
                <strong>Live data is slow to respond</strong>
                <p>
                  A request passed the {DEFAULT_REQUEST_TIMEOUT_MS / 1000}-second deadline, so this
                  panel is showing its unavailable state. Refresh the section to try again.
                </p>
              </div>
              <button
                type="button"
                className="demo-banner-link"
                onClick={() => setSlowDataNoticeVisible(false)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {currentSection === "Overview" ? (
            <OverviewPage
              orders={orders}
              orderFeedStatus={ordersStatus}
              ordersTruncated={ordersTruncated}
              canUpdateOrders={canUpdateOrderHeaders}
              inventory={inventory}
              inventoryStatus={inventoryStatus}
              inventoryTruncated={inventoryTruncated}
              recommendation={currentRecommendation}
              recommendationStatus={currentRecommendationStatus}
              openIncidentCount={currentOpenIncidentCount}
              incidentStatus={currentIncidentStatus}
              incidentTruncated={currentIncidentTruncated}
              showAi={canUseInsights}
              role={role}
              healthScore={healthScore}
              healthScoreStatus={healthScoreStatus}
              healthScoreError={healthScoreError}
              onRefreshHealthScore={() => setHealthScoreRefreshKey((current) => current + 1)}
              canManageInventory={canManageInventory}
              onAdvance={advanceOrder}
              onRestock={addStock}
              onOpen={() => goTo("Insights")}
              onOrders={() => goTo("Orders")}
              onReservations={() => goTo("Reservations")}
            />
          ) : currentSection === "Orders" ? (
            <OrdersPage
              orders={orders}
              status={ordersStatus}
              truncated={ordersTruncated}
              canUpdateOrders={canUpdateOrderHeaders}
              onAdvance={advanceOrder}
              search={orderSearch}
              onSearch={setOrderSearch}
              statusFilter={orderStatusFilter}
              onFilter={setOrderStatusFilter}
              onRefresh={() => setOrdersRefreshKey((current) => current + 1)}
            />
          ) : currentSection === "Kitchen" ? (
            <KitchenPage
              orders={orders}
              tickets={kitchenTickets}
              status={kitchenQueueStatus}
              truncated={kitchenQueueTruncated}
              onRefresh={() => setKitchenQueueRefreshKey((current) => current + 1)}
              onAdvanceItem={(orderId, itemId) => void advanceKitchenItem(orderId, itemId)}
              onAdvanceOrder={(orderId) => void advanceOrder(orderId)}
            />
          ) : currentSection === "Reservations" ? (
            <>
              <ReservationsPage
                reservations={reservations}
                status={reservationsStatus}
                truncated={reservationsTruncated}
                savingId={savingReservationId}
                onUpdate={updateReservation}
                onRefresh={() => setReservationsRefreshKey((current) => current + 1)}
                onToast={notify}
              />
              <FloorPanel
                accessToken={accessToken}
                refreshKey={reservationsRefreshKey}
                onToast={notify}
              />
            </>
          ) : currentSection === "Inventory" ? (
            <InventoryPage
              inventory={inventory}
              onRestock={addStock}
              canManageInventory={canManageInventory}
              inventoryStatus={inventoryStatus}
              inventoryTruncated={inventoryTruncated}
              onRefresh={() => setInventoryRefreshKey((current) => current + 1)}
            />
          ) : currentSection === "Incidents" ? (
            <IncidentsPage
              incidents={currentIncidents}
              status={currentIncidentStatus}
              truncated={currentIncidentTruncated}
              recommendation={currentRecommendation}
              onInsights={() => goTo("Insights")}
            />
          ) : currentSection === "Insights" ? (
            <InsightsPage
              recommendation={currentRecommendation}
              recommendationStatus={currentRecommendationStatus}
              incident={currentRecommendationIncident ?? null}
              incidentStatus={currentIncidentStatus}
              reviewed={currentRecommendationReviewed}
              onReview={() => {
                setRecommendationReviewed(true);
                setRecommendationScopeKey(workspaceScopeKey);
                notify("Insight marked as reviewed.");
              }}
              onGenerate={() => void generateRecommendation()}
              generating={generating}
            />
          ) : currentSection === "Analytics" ? (
            <AnalyticsPage key={workspaceScopeKey} />
          ) : (
            <SettingsPage
              userName={user?.name ?? "Maya Nair"}
              role={user?.role ?? "Manager preview"}
              onToast={notify}
            />
          )}

          <footer className="app-footer">
            <span>© 2026 DineSmart</span>
            <span>Thoughtful service, in rhythm.</span>
            <button type="button" onClick={() => goTo("Settings")}>
              Help &amp; support
            </button>
          </footer>
        </div>
      </main>
      {toast ? (
        <div className="toast-message" role="status">
          <span>
            <Icon name="check" size={16} />
          </span>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
