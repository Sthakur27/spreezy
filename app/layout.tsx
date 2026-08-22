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
  metadataBase: new URL("https://rapid-rsvp-reader.sidbthakur.chatgpt.site"),
  title: "Rapid — RSVP Speed Reader",
  description: "Read at the speed of thought with a focused RSVP reader.",
  openGraph: {
    title: "Rapid — RSVP Speed Reader",
    description: "Read at the speed of thought with a focused RSVP reader.",
    url: "https://rapid-rsvp-reader.sidbthakur.chatgpt.site",
    siteName: "Rapid",
    images: [{ url: "/og.png", width: 1734, height: 907, alt: "Rapid — Read at the speed of thought." }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rapid — RSVP Speed Reader",
    description: "Read at the speed of thought with a focused RSVP reader.",
    images: ["/og.png"],
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
