import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Andhrímnir | Restaurant Operations",
    template: "%s | Andhrímnir",
  },
  description: "The initial application shell for the Andhrímnir restaurant operations platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-neutral-950 antialiased">
        <a
          className="sr-only rounded-sm bg-white px-4 py-2 text-neutral-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-10 focus:ring-2 focus:ring-neutral-700"
          href="#main-content"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
