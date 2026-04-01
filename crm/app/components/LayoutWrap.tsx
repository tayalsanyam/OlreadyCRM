"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

export default function LayoutWrap({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login") return <>{children}</>;
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
