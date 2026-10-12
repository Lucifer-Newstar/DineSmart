"use client";

import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { Dashboard } from "./dashboard";

export function HomeRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) return children;
  return <Dashboard />;
}
