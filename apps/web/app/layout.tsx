import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWAInstaller from "./PWAInstaller";

export const metadata: Metadata = {
  title: "CoolFTC — FTC Intelligence Platform",
  description: "The #1 FTC scouting and strategy platform. Built by Team #30439 Cool Name Pending.",
  icons: { icon: "/favicon.ico" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CoolFTC",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "CoolFTC",
    description: "ARIA strategy AI, Hive Mind scouting, The Forge simulation, War Room — all in one.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#FF5A1F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PWAInstaller />
      </body>
    </html>
  );
}
