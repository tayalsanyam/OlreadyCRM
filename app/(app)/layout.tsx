import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SearchProvider } from "@/components/search/SearchProvider";
import { AppShellClient } from "@/components/layout/AppShellClient";
import { safeDbQuery } from "@/lib/db-connection-error";
import { sql } from "@/db/index";
import { USE_MOCK } from "@/lib/mock-data";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Stale mock-mode JWT (e.g. userId "u-kanika") breaks DB queries after USE_MOCK_DATA=false
  if (!USE_MOCK && !UUID_RE.test(session.userId)) {
    await signOut();
    redirect("/login");
  }

  let unreadCount = USE_MOCK ? 2 : 0;
  if (!USE_MOCK) {
    unreadCount = await safeDbQuery(
      async () => {
        const [row] = await sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count FROM notifications
          WHERE staff_id = ${session.userId}::uuid AND "read" = false
        `;
        return row?.count ?? 0;
      },
      0,
      "layout.unreadNotifications",
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense
        fallback={
          <aside className="flex h-screen w-[240px] flex-col border-r border-slate-200 bg-brand" />
        }
      >
        <Sidebar user={session} unreadCount={unreadCount} />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={session} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <SearchProvider user={session} />
      <AppShellClient user={session} />
    </div>
  );
}
