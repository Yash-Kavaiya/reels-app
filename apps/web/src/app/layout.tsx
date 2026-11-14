import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReelCraft Studio",
  description: "Create Reels and YouTube Shorts with editable multilingual captions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center px-6 py-3">
            <Link href="/" className="text-lg font-semibold">
              ReelCraft Studio
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
