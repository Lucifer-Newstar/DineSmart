export type DashboardRole =
  | "Customer"
  | "Reception"
  | "Kitchen Staff"
  | "Manager"
  | "Administrator";

export interface DashboardNavigationItem {
  label: string;
  group: "main" | "manage";
}

export interface DashboardWorkspaceIdentity {
  id: string;
  restaurantId: string | null;
  role: DashboardRole;
}

export function dashboardWorkspaceScopeKey(
  identity: DashboardWorkspaceIdentity | null | undefined,
): string {
  return identity ? JSON.stringify([identity.id, identity.restaurantId, identity.role]) : "preview";
}

export function valueForDashboardWorkspace<T>(
  value: T,
  valueScopeKey: string,
  activeScopeKey: string,
  fallback: T,
): T {
  return valueScopeKey === activeScopeKey ? value : fallback;
}

const KITCHEN_SECTIONS = new Set(["Overview", "Orders", "Kitchen", "Inventory", "Settings"]);
const RECEPTION_SECTIONS = new Set(["Overview", "Orders", "Reservations", "Inventory", "Settings"]);

export function navigationForRole<T extends DashboardNavigationItem>(
  navigation: T[],
  role: DashboardRole | null | undefined,
): T[] {
  if (role === "Kitchen Staff")
    return navigation.filter((item) => KITCHEN_SECTIONS.has(item.label));
  if (role === "Reception") return navigation.filter((item) => RECEPTION_SECTIONS.has(item.label));
  if (role === "Customer") return [];
  return navigation;
}

export function canAccessDashboardSection<T extends DashboardNavigationItem>(
  navigation: T[],
  role: DashboardRole | null | undefined,
  section: string,
): boolean {
  return navigationForRole(navigation, role).some((item) => item.label === section);
}

export function resolveDashboardSection<T extends DashboardNavigationItem>(
  navigation: T[],
  role: DashboardRole | null | undefined,
  section: string,
  fallback = "Overview",
): string {
  return canAccessDashboardSection(navigation, role, section) ? section : fallback;
}

export function canViewRecommendations(role: DashboardRole | null | undefined): boolean {
  return role === undefined || role === null || role === "Manager" || role === "Administrator";
}

export function canViewAnalytics(role: DashboardRole | null | undefined): boolean {
  return role === "Manager" || role === "Administrator";
}

export function canViewIncidents(role: DashboardRole | null | undefined): boolean {
  return role === "Manager" || role === "Administrator";
}

export function canViewHealthScore(role: DashboardRole | null | undefined): boolean {
  return role === "Reception" || role === "Manager" || role === "Administrator";
}
