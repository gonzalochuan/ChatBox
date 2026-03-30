import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClientInit from "@/components/ClientInit";
import GlobalBannerFeed from "@/components/GlobalBannerFeed";
import FloatingBubbles from "@/components/FloatingBubbles";
import FloatingChatOverlay from "@/components/FloatingChatOverlay";

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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "ChatBox x SEAIT | Official Communication Platform",
  description: "ChatBox — The official intranet-based communication platform for modern messaging. Offline-ready, secure, and built for speed.",
  keywords: ["ChatBox", "SEAIT", "ChatBox SEAIT", "Messaging Platform", "PWA Chat App", "Intranet Chat", "Offline Messenger"],
  manifest: "/manifest.json",
  authors: [{ name: "SEAIT Team" }],
  openGraph: {
    title: "ChatBox x SEAIT | Official Messenger",
    description: "Professional intranet-based communication. Stay connected even in low-signal environments.",
    url: "https://chatbox-nu-seven.vercel.app/",
    siteName: "ChatBox x SEAIT",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "ChatBox x SEAIT Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ChatBox x SEAIT | Official Messenger",
    description: "Secure, offline-ready messenger for modern teams.",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ChatBox x SEAIT",
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
        <FloatingBubbles />
        <FloatingChatOverlay />
        <div className="app-theme min-h-dvh">
          {children}
        </div>
      </body>
    </html>
  );
}
