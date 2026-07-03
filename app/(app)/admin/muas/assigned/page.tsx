import { redirect } from "next/navigation";

/** Legacy URL — assigned MUAs are on Manage MUAs with reassign inline. */
export default function AdminMuasAssignedRedirectPage() {
  redirect("/admin/muas?salesRm=assigned");
}
