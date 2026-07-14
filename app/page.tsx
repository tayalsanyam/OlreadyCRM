import { redirect } from "next/navigation";
import { getSession, getRoleHome } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  redirect(getRoleHome(session.role));
}
