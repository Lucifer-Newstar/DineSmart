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

const KITCHEN_SECTIONS = new Set(["Overview", "Orders", "Kitchen", "Inventory", "Settings"]);
const RECEPTION_SECTIONS = new Set(["Overview", "Orders", "Reservations", "Settings"]);

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

export function canViewRecommendations(role: DashboardRole | null | undefined): boolean {
  return role === undefined || role === null || role === "Manager" || role === "Administrator";
}
