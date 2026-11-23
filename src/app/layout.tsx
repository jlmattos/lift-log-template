import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { WakeLockKeeper } from "@/components/wake-lock-keeper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lift Log",
  description: "Unilateral workout tracker",
  manifest: "/manifest.json",
  // Personal single-user app — keep it out of search engines entirely.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lift Log",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav />
        {/* Keeps the screen on while the app is open (toggle in timer settings) */}
        <WakeLockKeeper />
      </body>
    </html>
  );
}
