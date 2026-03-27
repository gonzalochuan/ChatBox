import type { Metadata, Viewport } from "next";
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

const poppinsLocal = localFont({
  src: [
    {
      path: "../fonts/Poppins/Poppins-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/Poppins/Poppins-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/Poppins/Poppins-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/Poppins/Poppins-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "ChatBox",
  description: "ChatBox — Intranet Based Communication Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ChatBox",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
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
        className={`${geistSans.variable} ${geistMono.variable} ${poppinsLocal.variable} antialiased`}
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
