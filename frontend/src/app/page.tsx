import type { Metadata } from "next";
import { HomeRoute } from "./home-route";
import LandingPage from "./landing-page";

export const metadata: Metadata = {
  title: "Good food, good company",
  description:
    "Explore the current menu, request a table, and keep your restaurant plans together with DineSmart.",
};

export default function HomePage() {
  return (
    <HomeRoute>
      <LandingPage />
    </HomeRoute>
  );
}
