import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessDashboardSection,
  canViewAnalytics,
  canViewHealthScore,
  canViewRecommendations,
  dashboardWorkspaceScopeKey,
  navigationForRole,
  resolveDashboardSection,
  valueForDashboardWorkspace,
} from "../src/app/dashboard-access.ts";

const navigation = [
  { label: "Overview", group: "main" },
  { label: "Orders", group: "main" },
  { label: "Kitchen", group: "main" },
  { label: "Reservations", group: "main" },
  { label: "Inventory", group: "manage" },
  { label: "Incidents", group: "manage" },
  { label: "Insights", group: "manage" },
  { label: "Analytics", group: "manage" },
  { label: "Settings", group: "manage" },
];

const labels = (items) => items.map(({ label }) => label);

test("Reception sees orders, reservations, stock availability, and no management-only pages", () => {
  assert.deepEqual(labels(navigationForRole(navigation, "Reception")), [
    "Overview",
    "Orders",
    "Reservations",
    "Inventory",
    "Settings",
  ]);
  assert.equal(canAccessDashboardSection(navigation, "Reception", "Inventory"), true);
  assert.equal(canAccessDashboardSection(navigation, "Reception", "Analytics"), false);
  assert.equal(canAccessDashboardSection(navigation, "Reception", "Insights"), false);
});

test("Kitchen Staff sees kitchen, relevant orders, and availability without guest or manager pages", () => {
  assert.deepEqual(labels(navigationForRole(navigation, "Kitchen Staff")), [
    "Overview",
    "Orders",
    "Kitchen",
    "Inventory",
    "Settings",
  ]);
  assert.equal(canAccessDashboardSection(navigation, "Kitchen Staff", "Reservations"), false);
  assert.equal(canAccessDashboardSection(navigation, "Kitchen Staff", "Incidents"), false);
  assert.equal(canAccessDashboardSection(navigation, "Kitchen Staff", "Analytics"), false);
});

test("Manager and Administrator retain restaurant-wide access; Customer gets no staff navigation", () => {
  for (const role of ["Manager", "Administrator"]) {
    assert.deepEqual(labels(navigationForRole(navigation, role)), labels(navigation));
    assert.equal(canAccessDashboardSection(navigation, role, "Analytics"), true);
  }
  assert.deepEqual(navigationForRole(navigation, "Customer"), []);
  assert.equal(canAccessDashboardSection(navigation, "Customer", "Orders"), false);
});

test("unauthorized or stale dashboard sections resolve to the safe overview", () => {
  assert.equal(resolveDashboardSection(navigation, "Reception", "Analytics"), "Overview");
  assert.equal(resolveDashboardSection(navigation, "Kitchen Staff", "Reservations"), "Overview");
  assert.equal(resolveDashboardSection(navigation, "Manager", "Analytics"), "Analytics");
  assert.equal(resolveDashboardSection(navigation, "Customer", "Overview"), "Overview");
});

test("dashboard-only access follows the approved role matrix", () => {
  assert.equal(canViewAnalytics("Manager"), true);
  assert.equal(canViewAnalytics("Administrator"), true);
  assert.equal(canViewAnalytics("Reception"), false);
  assert.equal(canViewAnalytics("Kitchen Staff"), false);
  assert.equal(canViewHealthScore("Reception"), true);
  assert.equal(canViewHealthScore("Kitchen Staff"), false);
  assert.equal(canViewRecommendations(undefined), true);
  assert.equal(canViewRecommendations("Manager"), true);
  assert.equal(canViewRecommendations("Reception"), false);
});

test("tenant-bound workspace values fall back immediately when the signed-in scope changes", () => {
  const managerA = {
    id: "manager-a",
    restaurantId: "restaurant-a",
    role: "Manager",
  };
  const managerB = {
    id: "manager-b",
    restaurantId: "restaurant-b",
    role: "Manager",
  };
  const adminA = { ...managerA, role: "Administrator" };
  const scopeA = dashboardWorkspaceScopeKey(managerA);
  const scopeB = dashboardWorkspaceScopeKey(managerB);

  assert.equal(scopeA, dashboardWorkspaceScopeKey(managerA));
  assert.notEqual(scopeA, scopeB);
  assert.notEqual(scopeA, dashboardWorkspaceScopeKey(adminA));
  assert.equal(dashboardWorkspaceScopeKey(null), "preview");
  assert.equal(
    valueForDashboardWorkspace("tenant A report", scopeA, scopeA, "preview"),
    "tenant A report",
  );
  assert.equal(valueForDashboardWorkspace("tenant A report", scopeA, scopeB, "preview"), "preview");
  assert.equal(valueForDashboardWorkspace(true, scopeA, scopeB, false), false);
});
