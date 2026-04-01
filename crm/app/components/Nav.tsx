"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/customers", label: "Customers" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/payments", label: "Payment Pending" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reports", label: "Reports" },
  { href: "/communications", label: "Communications" },
  { href: "/bdm-log", label: "BDM Log" },
  { href: "/activity-log", label: "Activity" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const path = usePathname();
  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => {
      window.location.href = "/login";
    });
  };
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-700 bg-slate-900/50 px-4 py-2">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            path === href
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          }`}
        >
          {label}
        </Link>
      ))}
      <button onClick={handleLogout} className="ml-auto rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200">
        Logout
      </button>
    </nav>
  );
}
