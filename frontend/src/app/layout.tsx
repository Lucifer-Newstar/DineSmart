import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import "./globals.css";
import "./menu/menu.css";
import "./orders/orders.css";
import "./bookings/bookings.css";
import "./account/account.css";

export const metadata: Metadata = {
  title: {
    default: "DineSmart | Restaurant operations, in rhythm",
    template: "%s | DineSmart",
  },
  description:
    "A calmer way to run service: restaurant operations, guest care, and practical AI recommendations in one place.",
  applicationName: "DineSmart",
  appleWebApp: { capable: true, title: "DineSmart", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#284238",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
