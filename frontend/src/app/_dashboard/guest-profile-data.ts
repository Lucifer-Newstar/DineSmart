/** Guest profile shown beside a booking for staff (S5-02). */

export const GUEST_TAG_OPTIONS = [
  "VIP",
  "regular",
  "allergy",
  "accessibility",
  "family",
  "business",
] as const;

export interface GuestProfileView {
  visitCount: number;
  noShowCount: number;
  lastVisitAt: string | null;
  tags: string[];
  staffNote: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGuestProfile(value: unknown): GuestProfileView | null {
  if (!isRecord(value)) return null;
  if (typeof value.visitCount !== "number" || typeof value.noShowCount !== "number") return null;
  return {
    visitCount: value.visitCount,
    noShowCount: value.noShowCount,
    lastVisitAt: typeof value.lastVisitAt === "string" ? value.lastVisitAt : null,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    staffNote: typeof value.staffNote === "string" ? value.staffNote : null,
  };
}

/** "First visit", or "4 visits · 1 no-show · last 2 Oct 2026". */
export function guestHistoryLine(profile: GuestProfileView, timeZone = "Asia/Kolkata"): string {
  if (profile.visitCount === 0 && profile.noShowCount === 0) return "First visit";
  const parts = [`${profile.visitCount} ${profile.visitCount === 1 ? "visit" : "visits"}`];
  if (profile.noShowCount > 0) {
    parts.push(`${profile.noShowCount} ${profile.noShowCount === 1 ? "no-show" : "no-shows"}`);
  }
  if (profile.lastVisitAt && Number.isFinite(Date.parse(profile.lastVisitAt))) {
    parts.push(
      `last ${new Intl.DateTimeFormat("en-IN", {
        timeZone,
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(profile.lastVisitAt))}`,
    );
  }
  return parts.join(" · ");
}

/** Allergy-type warnings first, so they are hard to miss on a busy shift. */
export function needsAllergyAttention(
  profile: GuestProfileView | undefined,
  dietaryNotes?: string,
) {
  return Boolean(dietaryNotes) || Boolean(profile?.tags.includes("allergy"));
}
