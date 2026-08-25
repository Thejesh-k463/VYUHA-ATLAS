import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "atlas · by VYUHA",
  description: "Map everything you own.",
};

const NAV = [
  { href: "/", label: "Map" },
  { href: "/trading", label: "Trading" },
  { href: "/accounts", label: "Accounts" },
  { href: "/import", label: "Import" },
  { href: "/system", label: "System" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-panel-edge">
          <div className="mx-auto flex max-w-5xl items-baseline gap-8 px-6 py-4">
            <Link href="/" className="font-display text-lg font-semibold tracking-tight">
              atlas<span className="text-ink-soft text-sm font-normal"> · by VYUHA</span>
            </Link>
            <nav className="flex gap-5 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink-soft hover:text-teal">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
