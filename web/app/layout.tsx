import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";

import "./globals.css";

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-serif",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Tonight",
  description: "Build your taste. Find your movie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable}`}>
      <body className="bg-night text-ink">{children}</body>
    </html>
  );
}
