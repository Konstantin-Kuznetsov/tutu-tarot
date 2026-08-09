import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Таро-турагент",
  description: "3D tarot ritual for Russian travel planning with Tutu routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
