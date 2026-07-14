import { redirect } from "next/navigation";

/** Legacy URL — uploader review lives on Assign Leads. */
export default function AdminNotInterestedLeadsPage() {
  redirect("/admin/assign?tab=uploader_review");
}
