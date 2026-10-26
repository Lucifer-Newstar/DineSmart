import type { MetadataRoute } from "next";

/** Installable web app (S5-05): Chrome, Edge and Android offer "Install" from this manifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DineSmart",
    short_name: "DineSmart",
    description: "Book a table, order from your table and follow your order live.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ea",
    theme_color: "#284238",
    lang: "en-IN",
    categories: ["food", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Menu", url: "/menu" },
      { name: "My bookings", url: "/bookings" },
      { name: "My orders", url: "/orders" },
    ],
  };
}
