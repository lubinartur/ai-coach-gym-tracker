import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Execution Panel",
  description: "Plan → do → log → learn → next plan",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-neutral-950 text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
