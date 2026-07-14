import { redirect } from "next/navigation";

export default function LegacyAiPersonaPage() {
  redirect("/admin/ai?domain=sales");
}
