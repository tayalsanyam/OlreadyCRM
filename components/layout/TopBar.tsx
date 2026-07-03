"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { AdminAssignTaskButton } from "@/components/admin/AdminAssignTaskButton";
import { Button } from "@/components/ui/Button";
import { OPEN_SEARCH_EVENT } from "@/components/search/SearchProvider";
import { UserProfileSlideOver } from "@/components/layout/UserProfileSlideOver";
import type { SessionUser } from "@/lib/types";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  regionalRm: "Regional RM",
  commissionRm: "Commission RM",
  leadUploader: "Lead Uploader",
  feedbackRm: "Feedback",
  careAgent: "Care Agent",
  salesRm: "Sales RM",
  salesTl: "Sales TL",
  salesActivation: "Sales Activation",
  admin: "Admin",
  owner: "Owner",
};

interface TopBarProps {
  user: SessionUser;
  unreadCount: number;
}

export function TopBar({ user, unreadCount }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const showAdminAssignTask =
    (user.role === "admin" || user.role === "owner") && pathname.startsWith("/admin");

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Still clear session client-side if the server is unreachable
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-lg font-bold text-brand">Olready</div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
          className="hidden items-center gap-2 rounded-full border border-slate-200 bg-light-bg px-3 py-1.5 text-sm text-slate-muted transition-colors hover:border-slate-300 hover:text-brand sm:flex"
        >
          <Search className="h-4 w-4" />
          <span>Search…</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-muted">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
          className="rounded-lg p-2 hover:bg-light-bg sm:hidden"
          aria-label="Search"
        >
          <Search className="h-5 w-5 text-slate-muted" />
        </button>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="text-sm text-text hover:underline"
        >
          {user.name}{" "}
          <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent no-underline">
            {ROLE_LABELS[user.role]}
          </span>
        </button>
        <button
          type="button"
          className="relative rounded-lg p-2 hover:bg-light-bg"
          aria-label="Notifications"
          onClick={() => router.push("/notifications")}
        >
          <span className="text-lg">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {showAdminAssignTask ? <AdminAssignTaskButton /> : null}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
      <UserProfileSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
      />
    </header>
  );
}
