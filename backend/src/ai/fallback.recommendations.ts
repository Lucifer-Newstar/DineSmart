import type { IncidentRecommendationContext, StructuredRecommendation } from "./contracts.js";

function oldestTicketMinutes(context: IncidentRecommendationContext): number {
  return context.operations.activeOrders.reduce(
    (oldest, order) => Math.max(oldest, order.ageMinutes),
    0,
  );
}

/**
 * Trigger snapshots are advisory input, so a missing or non-finite field simply
 * degrades the wording instead of producing a number the rules never supplied.
 */
function triggerNumber(value: string | number | boolean | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildFallbackRecommendation(
  context: IncidentRecommendationContext,
): StructuredRecommendation {
  const type = context.incident.type;
  const oldest = oldestTicketMinutes(context);

  if (type === "kitchen_delay" || type === "order_delay" || type === "kitchen_congestion") {
    const queueLength =
      context.incident.trigger.queueLength ?? context.operations.activeOrders.length;
    return {
      summary: `The ${type.replaceAll("_", " ")} needs an operator check before more tickets stack up.`,
      rootCause:
        oldest > 0
          ? `An active order has been in its current stage for about ${oldest} minutes; the trigger reports a queue of ${queueLength}.`
          : "The incident trigger indicates that a kitchen or order timing threshold has been crossed.",
      priority: context.incident.severity,
      actions: [
        {
          description:
            "Review the oldest open ticket and confirm its current station and promised time.",
          rationale:
            "The current context shows a timing or queue pressure signal, but not enough detail to assign a cause automatically.",
          expectedImpact:
            "Helps the shift lead focus attention on the order most likely to delay service.",
        },
        {
          description:
            "Rebalance one cross-trained teammate only if food-safety and station coverage allow it.",
          rationale:
            "A short, supervised capacity change can relieve a bottleneck without bypassing kitchen controls.",
          expectedImpact:
            "May reduce the oldest ticket time while preserving safe station coverage.",
        },
      ],
      confidence: oldest > 0 ? 0.68 : 0.48,
    };
  }

  if (type === "inventory_shortage") {
    const item = context.operations.lowStockItems[0];
    return {
      summary: item
        ? `${item.name} is below its configured stock threshold.`
        : "An inventory threshold was crossed; confirm the on-hand count before changing menu availability.",
      rootCause: item
        ? `The available quantity is ${item.quantity} ${item.unit}, compared with a low-stock threshold of ${item.lowStockThreshold} ${item.unit}.`
        : "The incident indicates a stock threshold, but no current low-stock row was included in the context.",
      priority: context.incident.severity,
      actions: [
        {
          description:
            "Confirm the item count with a quick physical check and record the adjustment.",
          rationale:
            "A count check distinguishes a true shortage from an unrecorded delivery or waste adjustment.",
          expectedImpact: "Restores a more reliable availability signal for the floor and kitchen.",
        },
        {
          description:
            "Review affected menu availability with the shift manager before promising new orders.",
          rationale: "The system does not change menu availability automatically.",
          expectedImpact: "Reduces the risk of accepting an order that the kitchen cannot prepare.",
        },
      ],
      confidence: item ? 0.72 : 0.46,
    };
  }

  if (type === "queue_congestion") {
    const trigger = context.incident.trigger;
    const queueLength = triggerNumber(trigger.queueLength);
    const waitedMinutes = triggerNumber(trigger.elapsedMinutes);
    const thresholdMinutes = triggerNumber(trigger.thresholdMinutes);
    const largestParty = triggerNumber(trigger.partySize);
    const hasEvidence = queueLength !== null || waitedMinutes !== null;

    return {
      summary:
        queueLength !== null
          ? `${queueLength} parties are waiting${
              largestParty !== null ? `; the largest is a party of ${largestParty}` : ""
            }.`
          : "The waiting queue has crossed a configured congestion threshold.",
      rootCause:
        waitedMinutes !== null && thresholdMinutes !== null
          ? `The longest wait is about ${waitedMinutes} minutes against a configured threshold of ${thresholdMinutes} minutes. No guest identity is included in this recommendation context.`
          : "The waiting queue crossed a configured party-count or wait threshold. No guest identity is included in this recommendation context.",
      priority: context.incident.severity,
      actions: [
        {
          description:
            "Confirm the queue order at reception and re-quote the wait for the parties still waiting.",
          rationale:
            "A short queue check distinguishes a genuinely blocked floor from a stale list the team has already worked through.",
          expectedImpact:
            "Gives guests an accurate expectation and stops staff from re-checking parties that are about to be seated.",
        },
        {
          description:
            "Seat any waiting party a free table can accommodate before holding parties for a larger table.",
          rationale:
            "Turning the tables that fit reduces the longest wait without displacing a party that needs specific capacity.",
          expectedImpact:
            "Shortens the longest wait and lowers the chance of the queue reaching its critical threshold.",
        },
      ],
      confidence: hasEvidence ? 0.66 : 0.5,
    };
  }

  if (type === "table_congestion") {
    const trigger = context.incident.trigger;
    const freeTables = triggerNumber(trigger.available);
    const largestCapacity = triggerNumber(trigger.capacity);
    const largestParty = triggerNumber(trigger.partySize);
    const waitedMinutes = triggerNumber(trigger.elapsedMinutes);
    const hasEvidence = freeTables !== null || largestParty !== null;

    return {
      summary:
        largestParty !== null
          ? `A party of ${largestParty} is waiting${
              freeTables === 0
                ? " and no table is currently marked available."
                : " with no available table that can seat it."
            }`
          : "Parties are waiting while no suitable table is available.",
      rootCause:
        freeTables === 0
          ? "No table is currently marked available while parties are waiting. No guest identity is included in this recommendation context."
          : largestCapacity !== null && largestParty !== null
            ? `The largest free table seats ${largestCapacity}, which cannot take the waiting party of ${largestParty}${
                waitedMinutes !== null ? ` after about ${waitedMinutes} minutes of waiting` : ""
              }. No guest identity is included in this recommendation context.`
            : "The floor has no table able to seat the parties that are waiting. No guest identity is included in this recommendation context.",
      priority: context.incident.severity,
      actions: [
        {
          description:
            "Review the floor plan with the shift lead and combine, turn, or split a table only if service standards allow it.",
          rationale:
            "A supervised floor-plan change is the only safe way to seat a party larger than any single free table.",
          expectedImpact:
            "Converts blocked capacity into a seating without promising a table size the floor cannot provide.",
        },
        {
          description:
            "Give the affected party a realistic estimate and an alternative, such as waiting for a specific table or returning later.",
          rationale:
            "An honest estimate is safer than holding a party for a table that may not free up in time.",
          expectedImpact:
            "Protects the guest experience while the floor team resolves the capacity pressure.",
        },
      ],
      confidence: hasEvidence ? 0.64 : 0.48,
    };
  }

  if (type === "reservation_conflict") {
    return {
      summary: "Review the next seating window and re-confirm table capacity with the floor team.",
      rootCause:
        "The incident trigger flags seating or wait pressure; customer identity is intentionally not included in this recommendation context.",
      priority: context.incident.severity,
      actions: [
        {
          description:
            "Check the next reservation block against table capacity and current seating status.",
          rationale:
            "A quick floor-plan review can identify a safe reassignment before arrival time.",
          expectedImpact: "Helps avoid double-booking and reduces unplanned guest waits.",
        },
        {
          description: "Ask reception to share a realistic wait estimate with affected guests.",
          rationale: "Clear expectations are safer than promising an unverified seating time.",
          expectedImpact:
            "Improves the guest experience while the floor team resolves the capacity pressure.",
        },
      ],
      confidence: 0.55,
    };
  }

  return {
    summary:
      "Review the incident evidence with the shift lead and choose a reversible corrective action.",
    rootCause:
      "The deterministic fallback has no incident-specific evidence rule for this type, so it avoids guessing at a cause.",
    priority: context.incident.severity,
    actions: [
      {
        description: "Verify the triggering measurement and the restaurant's configured threshold.",
        rationale: "Confirming the source data prevents an unnecessary operational change.",
        expectedImpact: "Improves confidence in the next decision and reduces false alarms.",
      },
      {
        description: "Record the manager's resolution note after reviewing the incident.",
        rationale:
          "A short note preserves context for the next shift without changing records automatically.",
        expectedImpact: "Supports continuity and future incident review.",
      },
    ],
    confidence: 0.4,
  };
}
