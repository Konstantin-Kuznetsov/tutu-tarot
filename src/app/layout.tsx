import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Таро-турагент",
  description: "Мистический подбор путешествий по России с маршрутами и отелями Туту.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
