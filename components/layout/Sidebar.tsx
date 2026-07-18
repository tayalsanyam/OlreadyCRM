"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ListOrdered,
  CheckSquare,
  ArrowRightLeft,
  Upload,
  LayoutDashboard,
  UserPlus,
  BarChart2,
  Settings,
  Users,
  Users2,
  TrendingUp,
  Bell,
  UserCog,
  CalendarCheck,
  FileText,
  Clock,
  MessageSquare,
  UserRoundCheck,
  Bot,
  UsersRound,
  Target,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isDayEndRequiredRole } from "@/lib/day-end";
import type { SessionUser, UserRole } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const ICONS = {
  queue: ListOrdered,
  tasks: CheckSquare,
  commission: ArrowRightLeft,
  upload: Upload,
  dashboard: LayoutDashboard,
  assign: UserPlus,
  reports: BarChart2,
  config: Settings,
  muas: Users,
  myMuas: Users2,
  analytics: TrendingUp,
  notifications: Bell,
  users: UserCog,
  bookings: CalendarCheck,
  assignedLeads: FileText,
  expired: Clock,
  prospects: UserPlus,
  feedback: MessageSquare,
  sales: UsersRound,
  activation: UserRoundCheck,
  ai: Bot,
  targets: Target,
  dayEnd: FileText,
} as const;

const DAY_END_NAV: NavItem = { href: "/day-end", label: "Day End Report", icon: ICONS.dayEnd };
const SIDEBAR_COLLAPSED_KEY = "olready_sidebar_collapsed";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function withDayEndNav(sections: NavSection[], role: UserRole): NavSection[] {
  if (!isDayEndRequiredRole(role)) return sections;
  if (!sections.length) return sections;
  return sections.map((section, index) =>
    index === 0
      ? { ...section, items: [...section.items, DAY_END_NAV] }
      : section,
  );
}

const ADMIN_NAV_GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: "tasks",
    label: "Tasks",
    items: [
      { href: "/admin/tasks", label: "Task hub", icon: ICONS.tasks },
      { href: "/admin/reports/day-end", label: "Day End Report", icon: ICONS.dayEnd },
      { href: "/care/grievances", label: "Grievance Centre", icon: ICONS.feedback },
      { href: "/admin/grievances/email-approvals", label: "Pending email approvals", icon: ICONS.feedback },
    ],
  },
  {
    key: "muas",
    label: "MUAs",
    items: [
      { href: "/admin/muas", label: "Manage MUAs", icon: ICONS.muas },
      { href: "/admin/muas?salesRm=unassigned", label: "Needs Sales RM", icon: ICONS.assign },
      { href: "/admin/muas/junk", label: "Junk Reference", icon: ICONS.expired },
      { href: "/admin/mua-prospects", label: "MUA Prospects", icon: ICONS.prospects },
      { href: "/admin/muas?tab=import&profile=prospect", label: "Upload MUAs", icon: ICONS.upload },
      { href: "/admin/bookings", label: "Bookings", icon: ICONS.bookings },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    items: [
      { href: "/admin/sales/overview", label: "Overview", icon: ICONS.dashboard },
      { href: "/admin/sales/reports", label: "Reports", icon: ICONS.reports },
      { href: "/admin/sales/rejected", label: "Rejected MUAs", icon: ICONS.prospects },
      { href: "/admin/sales/targets", label: "Targets", icon: ICONS.targets },
    ],
  },
  {
    key: "activation",
    label: "Activation",
    items: [
      { href: "/admin/activation/overview", label: "Activation Overview", icon: ICONS.dashboard },
      { href: "/admin/sales/activation", label: "Activation", icon: ICONS.activation },
    ],
  },
  {
    key: "feedback",
    label: "Feedback",
    items: [
      { href: "/admin/feedback/overview", label: "Feedback Overview", icon: ICONS.feedback },
      { href: "/admin/feedback", label: "Lead Feedback", icon: ICONS.feedback },
      { href: "/admin/feedback/reports", label: "Feedback Reports", icon: ICONS.reports },
      { href: "/admin/feedback-referrals", label: "Feedback Referrals", icon: ICONS.prospects },
    ],
  },
  {
    key: "backend",
    label: "Backend",
    items: [
      { href: "/admin/dashboard", label: "RM Overview", icon: ICONS.dashboard },
      { href: "/admin/uploader/overview", label: "Uploader Overview", icon: ICONS.upload },
      { href: "/admin/uploader/leads", label: "Uploader Leads Report", icon: ICONS.upload },
      { href: "/admin/assign", label: "Assign Leads", icon: ICONS.assign },
      { href: "/admin/assign?tab=uploader_review", label: "Review queue", icon: ICONS.upload },
      { href: "/admin/assign?tab=closed", label: "Closed leads", icon: ICONS.expired },
      { href: "/admin/leads/expired", label: "Expired Leads", icon: ICONS.expired },
      { href: "/admin/reports", label: "Reports", icon: ICONS.reports },
    ],
  },
  {
    key: "ai",
    label: "AI",
    items: [{ href: "/admin/ai", label: "AI Configuration", icon: ICONS.ai }],
  },
  {
    key: "care",
    label: "Care",
    items: [
      { href: "/care/grievance-reports", label: "Grievance reports", icon: ICONS.reports },
      { href: "/care/reports", label: "MUA ledger", icon: ICONS.reports },
      { href: "/admin/grievances/email-templates", label: "Care Email Templates", icon: ICONS.config },
      { href: "/admin/grievances/ai-guidance", label: "Care Config", icon: ICONS.config },
    ],
  },
  {
    key: "config",
    label: "Config & Users",
    items: [
      { href: "/admin/config", label: "Config", icon: ICONS.config },
      { href: "/admin/users", label: "Users", icon: ICONS.users },
      { href: "/admin/users/teams", label: "Sales teams", icon: ICONS.sales },
    ],
  },
];

const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

function withNotifications(sections: NavSection[]): NavSection[] {
  return sections.map((section, idx) => {
    if (idx !== 0) return section;
    if (section.items.some((i) => i.href === "/notifications")) return section;
    return {
      ...section,
      items: [
        ...section.items,
        {
          href: "/notifications",
          label: "Notifications",
          icon: ICONS.notifications,
        },
      ],
    };
  });
}

function isStaffNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href.endsWith("/add")) {
    return pathname.startsWith(`${href}/`);
  }
  if (pathname === `${href}/add` || pathname.startsWith(`${href}/add/`)) {
    return false;
  }
  return pathname.startsWith(`${href}/`);
}

const NAV_BY_ROLE: Record<UserRole, NavSection[]> = {
  regionalRm: [
    {
      label: "MAIN",
      items: [
        { href: "/rm/queue", label: "Lead Queue", icon: ICONS.queue },
        { href: "/rm/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/rm/muas", label: "My MUAs", icon: ICONS.myMuas },
        { href: "/rm/bookings", label: "Bookings", icon: ICONS.bookings },
        { href: "/rm/reports", label: "Reports", icon: ICONS.reports },
      ],
    },
  ],
  commissionRm: [
    {
      label: "MAIN",
      items: [
        { href: "/commission/queue", label: "Commission Queue", icon: ICONS.commission },
        { href: "/commission/muas", label: "MUA Database", icon: ICONS.myMuas },
        { href: "/commission/bookings", label: "Bookings", icon: ICONS.bookings },
        { href: "/rm/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/commission/reports", label: "Reports", icon: ICONS.reports },
      ],
    },
  ],
  feedbackRm: [
    {
      label: "MAIN",
      items: [
        { href: "/feedback/queue", label: "Post-event leads", icon: ICONS.expired },
        { href: "/feedback/referrals", label: "Captured referrals", icon: ICONS.prospects },
        { href: "/feedback/grievances", label: "Care tickets", icon: ICONS.feedback },
      ],
    },
    {
      label: "MUAs",
      items: [
        { href: "/feedback/muas", label: "MUA database", icon: ICONS.myMuas },
        { href: "/feedback/muas/add", label: "Add MUA", icon: ICONS.assign },
      ],
    },
    {
      label: "WORK",
      items: [
        { href: "/feedback/tasks", label: "Tasks", icon: ICONS.tasks },
        { href: "/feedback/reports", label: "Reports", icon: ICONS.reports },
      ],
    },
  ],
  careAgent: [
    {
      label: "CARE",
      items: [
        { href: "/care/grievances", label: "Grievance Centre", icon: ICONS.feedback },
        { href: "/care/support-inquiries", label: "Support inquiries", icon: ICONS.feedback },
        { href: "/care/tasks", label: "My Care Tasks", icon: ICONS.tasks },
        { href: "/care/grievance-reports", label: "Grievance reports", icon: ICONS.reports },
        { href: "/care/reports", label: "MUA ledger", icon: ICONS.reports },
      ],
    },
    {
      label: "MUAs",
      items: [
        { href: "/care/muas", label: "MUA lookup", icon: ICONS.myMuas },
        { href: "/care/muas/add", label: "Add MUA", icon: ICONS.assign },
      ],
    },
  ],
  leadUploader: [
    {
      label: "MAIN",
      items: [
        { href: "/upload/leads", label: "Upload Leads", icon: ICONS.upload },
        { href: "/upload/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/upload/referrals", label: "Feedback Referrals", icon: ICONS.feedback },
        { href: "/upload/reports", label: "Reports", icon: ICONS.reports },
      ],
    },
    {
      label: "MUAs",
      items: [{ href: "/upload/muas", label: "Add MUA", icon: ICONS.assign }],
    },
  ],
  salesRm: [
    {
      label: "SALES",
      items: [
        { href: "/sales/pipeline", label: "Pipeline", icon: ICONS.sales },
        { href: "/sales/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/sales/reports", label: "My Reports", icon: ICONS.reports },
        { href: "/sales/active", label: "Active MUAs", icon: ICONS.myMuas },
        { href: "/sales/ai", label: "AI Planner", icon: ICONS.ai },
      ],
    },
  ],
  salesTl: [
    {
      label: "SALES",
      items: [
        { href: "/sales/pipeline", label: "Pipeline", icon: ICONS.sales },
        { href: "/sales/reports", label: "Reports", icon: ICONS.reports },
        { href: "/sales/reports/day-end", label: "Team Day End", icon: ICONS.dayEnd },
        { href: "/sales/analysis", label: "Team Analysis", icon: ICONS.reports },
        { href: "/sales/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/sales/active", label: "Active MUAs", icon: ICONS.myMuas },
        { href: "/sales/ai", label: "AI Planner", icon: ICONS.ai },
      ],
    },
  ],
  salesActivation: [
    {
      label: "ACTIVATION",
      items: [
        { href: "/activation/queue", label: "Activation Queue", icon: ICONS.activation },
        { href: "/activation/sent-back", label: "Sent Back", icon: ICONS.feedback },
        { href: "/activation/tasks", label: "My Tasks", icon: ICONS.tasks },
        { href: "/activation/reports", label: "Reports", icon: ICONS.reports },
      ],
    },
  ],
  admin: [{ label: "ADMIN", items: ADMIN_NAV_ITEMS }],
  owner: [
    {
      label: "MAIN",
      items: [{ href: "/owner/analytics", label: "Analytics", icon: ICONS.analytics }],
    },
    { label: "ADMIN", items: ADMIN_NAV_ITEMS },
  ],
};

interface SidebarProps {
  user: SessionUser;
  unreadCount?: number;
}

export function Sidebar({ user, unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [openAdminGroups, setOpenAdminGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }
  const sections = withDayEndNav(
    withNotifications(NAV_BY_ROLE[user.role]).map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.href === "/admin/muas?salesRm=unassigned"
        ? { ...item, badgeCount: unassignedCount > 0 ? unassignedCount : undefined }
        : item
    ),
    })),
    user.role,
  );

  useEffect(() => {
    if (user.role !== "admin" && user.role !== "owner") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/sales/unassigned/count", {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        const count = Number(json?.data?.count ?? 0);
        if (!cancelled) setUnassignedCount(Number.isFinite(count) ? count : 0);
      } catch {
        if (!cancelled) setUnassignedCount(0);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user.role]);

  function isAdminNavItemActive(item: NavItem) {
    if (item.href === "/admin/tasks") {
      return pathname === "/admin/tasks";
    }
    if (item.href === "/admin/users") {
      return pathname === "/admin/users";
    }
    if (item.href === "/admin/feedback") {
      return pathname === "/admin/feedback";
    }
    if (item.href === "/admin/feedback-referrals") {
      return (
        pathname === "/admin/feedback-referrals" ||
        pathname.startsWith("/admin/feedback-referrals/")
      );
    }
    if (item.href === "/admin/sales/activation") {
      return (
        pathname === "/admin/sales/activation" ||
        pathname.startsWith("/admin/sales/activation/")
      );
    }
    if (item.href.startsWith("/admin/muas?tab=import")) {
      return pathname === "/admin/muas" && searchParams.get("tab") === "import";
    }
    if (item.href === "/admin/assign") {
      const assignTab = searchParams.get("tab");
      return pathname === "/admin/assign" && (assignTab === null || assignTab === "unassigned");
    }
    if (item.href === "/admin/assign?tab=uploader_review") {
      return pathname === "/admin/assign" && searchParams.get("tab") === "uploader_review";
    }
    if (item.href === "/admin/assign?tab=closed") {
      return pathname === "/admin/assign" && searchParams.get("tab") === "closed";
    }
    if (item.href === "/admin/muas") {
      const tab = searchParams.get("tab");
      return pathname === "/admin/muas" && (tab === null || tab === "all");
    }
    if (item.href === "/admin/reports") {
      return (
        pathname === "/admin/reports" ||
        (pathname.startsWith("/admin/reports/") &&
          !pathname.startsWith("/admin/reports/day-end"))
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  useEffect(() => {
    if (user.role !== "admin" && user.role !== "owner") return;
    const match = ADMIN_NAV_GROUPS.find((group) =>
      group.items.some((item) => isAdminNavItemActive(item)),
    );
    if (match) {
      setOpenAdminGroups((prev) => ({ ...prev, [match.key]: true }));
    }
  }, [pathname, user.role]);

  function renderAdminNavItem(item: NavItem) {
    const active = isAdminNavItemActive(item);
    const Icon = item.icon;
    const badgeCount =
      item.href === "/admin/muas?salesRm=unassigned" ? unassignedCount : item.badgeCount ?? 0;
    const showCount = badgeCount > 0;
    const showDot = item.href === "/notifications" && unreadCount > 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>{item.label}</span>
        {showDot ? (
          <span className="ml-auto h-2 w-2 rounded-full bg-red-500" aria-label="Unread notifications" />
        ) : null}
        {showCount ? (
          <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {badgeCount}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-slate-200 bg-brand text-white transition-all duration-200",
        collapsed ? "w-[64px]" : "w-[240px]"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-white/10 px-3 py-4",
          collapsed ? "flex-col justify-center px-2 py-3" : ""
        )}
      >
        <div
          className={cn(
            "min-w-0 flex-1 font-bold tracking-tight",
            collapsed && "text-center text-xs"
          )}
        >
          {collapsed ? "OL" : "Olready CRM"}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="shrink-0 rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2">
        {!collapsed && (user.role === "admin" || user.role === "owner") ? (
          <div>
            {user.role === "owner" ? (
              <div className="mb-3">
                <p className="mb-1 px-3 text-[10px] font-semibold tracking-widest text-white/40">MAIN</p>
                {renderAdminNavItem({
                  href: "/owner/analytics",
                  label: "Analytics",
                  icon: ICONS.analytics,
                })}
              </div>
            ) : null}
            <p className="mb-1 px-3 text-[10px] font-semibold tracking-widest text-white/40">ADMIN</p>
            {ADMIN_NAV_GROUPS.map((group) => {
              const open = openAdminGroups[group.key] ?? false;
              const groupActive = group.items.some((item) => isAdminNavItemActive(item));
              return (
                <div key={group.key} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setOpenAdminGroups((s) => ({ ...s, [group.key]: !open }))}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10",
                      groupActive ? "text-white" : "text-white/80"
                    )}
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>{group.label}</span>
                  </button>
                  {open ? (
                    <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                      {group.items.map((item) => renderAdminNavItem(item))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="mt-2 border-t border-white/10 pt-2">
              {renderAdminNavItem({
                href: "/notifications",
                label: "Notifications",
                icon: ICONS.notifications,
              })}
            </div>
          </div>
        ) : null}

        {(!(user.role === "admin" || user.role === "owner") || collapsed) ? (
        sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold tracking-widest text-white/40">
                {section.label}
              </p>
            )}
            {collapsed && (
              <div className="mx-auto mb-1 h-px w-8 bg-white/20" aria-hidden />
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isStaffNavItemActive(pathname, item.href);
                const Icon = item.icon;
                const showDot =
                  item.href === "/notifications" && unreadCount > 0;
                const showCount = (item.badgeCount ?? 0) > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-white/15 text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                      collapsed && "justify-center px-2"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {!collapsed && <span>{item.label}</span>}
                    {showDot && (
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full bg-red-500",
                          collapsed
                            ? "absolute right-1 top-1"
                            : "ml-auto"
                        )}
                        aria-label="Unread notifications"
                      />
                    )}
                    {showCount && (
                      <span
                        className={cn(
                          "rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white",
                          collapsed ? "absolute right-1 top-6" : "ml-auto"
                        )}
                        aria-label={`${item.badgeCount} pending`}
                      >
                        {item.badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))
        ) : null}
      </nav>
      <button
        type="button"
        onClick={toggleCollapsed}
        className="border-t border-white/10 px-4 py-3 text-left text-xs text-white/60 hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "Expand menu" : "Collapse menu"}
      </button>
    </aside>
  );
}
