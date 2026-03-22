import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Part Scout — Admin Dashboard",
  description: "Business metrics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${outfit.variable} font-outfit`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
