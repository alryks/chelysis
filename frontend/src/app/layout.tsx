import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Chelysis — Chess analysis",
  description: "Explore your games with Stockfish and understand every move.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
