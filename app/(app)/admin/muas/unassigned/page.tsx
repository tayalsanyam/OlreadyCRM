import { redirect } from "next/navigation";

/** Legacy URL — unassigned MUAs are filtered on Manage MUAs. */
export default function AdminMuasUnassignedRedirectPage() {
  redirect("/admin/muas?salesRm=unassigned");
}
