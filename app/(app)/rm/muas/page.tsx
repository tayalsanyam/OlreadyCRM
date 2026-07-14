import { MuaRosterView } from "@/components/muas/MuaRosterView";
import { getSession } from "@/lib/auth";
import { formatRegions, sessionStaffRegions } from "@/lib/mua-region";
import type { Region } from "@/lib/types";

export default async function RmMuasPage() {
  const session = await getSession();
  const allowedRegions = sessionStaffRegions(session) as Region[];
  const regionLabel = formatRegions(allowedRegions);

  return (
    <MuaRosterView
      apiPath="/api/rm/muas"
      title="My MUA Roster"
      subtitle={`Plan MUAs in ${regionLabel} — weekly caps and conversation load`}
      emptyMessage="No plan MUAs in your regions"
      conversationsHref="/rm/queue"
      allowedRegions={allowedRegions}
      rosterTabs={[
        {
          id: "region",
          label: "Region plan MUAs",
          apiPath: "/api/rm/muas",
          subtitle: `All plan MUAs across ${regionLabel} — weekly caps and conversation load`,
          emptyMessage: "No plan MUAs in your regions",
        },
        {
          id: "my_plan",
          label: "My Plan MUAs",
          apiPath: "/api/rm/muas?scope=my_plan",
          subtitle: "MUAs where you are the Plan RM — plan support and issues beyond bookings",
          emptyMessage: "No plan MUAs assigned to you yet",
        },
      ]}
    />
  );
}
