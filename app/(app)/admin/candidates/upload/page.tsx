import { redirect } from "next/navigation";

export default function CandidateUploadRedirectPage() {
  redirect("/admin/muas?tab=import&profile=prospect");
}
