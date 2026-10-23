"use client";

import { useEffect, useState } from "react";

const TIME_ZONE = "Asia/Kolkata";

export interface ServiceClock {
  greeting: string;
  todayEyebrow: string;
  servicePeriod: string;
}

/** Greeting, date line and service period for the restaurant's time zone. */
export function describeServiceTime(now: Date): ServiceClock {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE })
      .format(now)
      .slice(0, 2),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const servicePeriod =
    hour >= 6 && hour < 11
      ? "Breakfast service"
      : hour >= 11 && hour < 16
        ? "Lunch service"
        : hour >= 16 && hour < 23
          ? "Evening service"
          : "After hours";
  const todayEyebrow = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  })
    .format(now)
    .replace(",", " ·")
    .toUpperCase();
  return { greeting, todayEyebrow, servicePeriod };
}

/**
 * Renders a stable value on the server and first paint, then the real local
 * values after mount (avoids a hydration mismatch), refreshing every minute.
 */
export function useServiceClock(): ServiceClock {
  const [clock, setClock] = useState<ServiceClock>({
    greeting: "Welcome back",
    todayEyebrow: "TODAY",
    servicePeriod: "Service",
  });
  useEffect(() => {
    const update = () => setClock(describeServiceTime(new Date()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  return clock;
}
