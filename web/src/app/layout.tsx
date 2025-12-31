import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shorts Forge | Autonomous YouTube Shorts Agent",
  description:
    "Generate scroll-stopping YouTube Shorts blueprints and render downloadable 1080×1920 MP4s directly in the browser.",
  metadataBase: new URL("https://agentic-de62a07d.vercel.app"),
  openGraph: {
    title: "Shorts Forge | Autonomous YouTube Shorts Agent",
    description:
      "Blueprint, render, and download Shorts-ready vertical video in minutes.",
    type: "website",
    url: "https://agentic-de62a07d.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shorts Forge | Autonomous YouTube Shorts Agent",
    description:
      "Blueprint, render, and download Shorts-ready vertical video in minutes.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
