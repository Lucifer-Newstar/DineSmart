import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import "./globals.css";
import "./menu/menu.css";
import "./orders/orders.css";

export const metadata: Metadata = {
  title: {
    default: "DineSmart | Restaurant operations, in rhythm",
    template: "%s | DineSmart",
  },
  description:
    "A calmer way to run service: restaurant operations, guest care, and practical AI recommendations in one place.",
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
