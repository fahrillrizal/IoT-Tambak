import { cookies } from "next/headers";
import HistoryPageClient from "@/app/history/HistoryPageClient";

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return <HistoryPageClient defaultCollapsed={defaultCollapsed} />;
}