import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HyperReports AI",
  description: "Turn inspection voice memos into structured, ready-to-enter report content.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
