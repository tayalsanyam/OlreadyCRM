import type { Metadata } from "next";
import "./globals.css";
import LayoutWrap from "./components/LayoutWrap";

export const metadata: Metadata = {
  title: "Olready CRM",
  description: "CRM for lead and pipeline management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <LayoutWrap>{children}</LayoutWrap>
      </body>
    </html>
  );
}
