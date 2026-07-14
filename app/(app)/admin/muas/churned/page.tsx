import { redirect } from "next/navigation";

/** Legacy URL — win-back cohort on Manage MUAs (same as Sales → Re-engage). */
export default function AdminMuasChurnedRedirectPage() {
  redirect("/admin/muas?winBack=1");
}
