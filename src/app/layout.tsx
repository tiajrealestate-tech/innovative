import type { Metadata } from "next";
import { Inter, Saira_Extra_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const saira = Saira_Extra_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-saira",
});

export const metadata: Metadata = {
  title: "HyperReports AI",
  description:
    "Get home, not behind. Your walkthrough becomes the finished inspection report — in your words.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${saira.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
