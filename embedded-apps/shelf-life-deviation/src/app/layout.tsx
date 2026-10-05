import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_DESCRIPTION } from "@/lib/config";

export const metadata: Metadata = {
  title: "Shelf Life Deviation — Emami Apps",
  description: APP_DESCRIPTION,
  icons: { icon: "/apps/shelf-life-deviation/emami-apps-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="sapUiBody">{children}</body>
    </html>
  );
}
