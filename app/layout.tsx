import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Part Scout — Admin Dashboard",
  description: "Business metrics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
