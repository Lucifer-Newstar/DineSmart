import type { Metadata } from "next";
import { Dashboard } from "../dashboard";

export const metadata: Metadata = {
  title: "Restaurant workspace",
  description: "DineSmart restaurant operations workspace and sample preview.",
};

export default function DashboardPage() {
  return <Dashboard />;
}
