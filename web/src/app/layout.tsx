import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import ClientInit from "@/components/ClientInit";
import GlobalBannerFeed from "@/components/GlobalBannerFeed";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  weight: ["300", "400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChatBox",
  description: "ChatBox — Intranet Based Communication Platform",
  icons: {
    icon: "/cb-icon.svg",
    shortcut: "/cb-icon.svg",
    apple: "/cb-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased`}
      >
        <ClientInit />
        <GlobalBannerFeed />
        <div className="app-theme min-h-dvh">
          {children}
        </div>
      </body>
    </html>
  );
}
