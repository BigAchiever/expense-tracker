import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-hi", subsets: ["devanagari"] });

export const metadata: Metadata = {
  title: "Expense Manager",
  description: "Daily fees and expense log for the school",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Teachers zoom; do not fight them.
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${devanagari.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
