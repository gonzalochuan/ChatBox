import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClientInit from "@/components/ClientInit";
import GlobalBannerFeed from "@/components/GlobalBannerFeed";

const geistSans = localFont({
  src: "../../public/Akira Expanded Demo.otf",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../../public/Ethnocentric Rg.otf",
  variable: "--font-geist-mono",
  display: "swap",
});

const poppins = localFont({
  src: "../../public/Ethnocentric Rg It.otf",
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
