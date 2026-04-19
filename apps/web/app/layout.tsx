import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoolFTC — FTC Intelligence Platform",
  description: "The #1 FTC scouting and strategy platform. Built by Team #30439 Cool Name Pending.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "CoolFTC",
    description: "ARIA strategy AI, Hive Mind scouting, The Forge simulation, War Room — all in one.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
