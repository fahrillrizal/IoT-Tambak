import { cookies } from "next/headers";
import DashboardPageClient from "@/components/dashboard/DashboardPageClient";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return <DashboardPageClient defaultCollapsed={defaultCollapsed} />;
}