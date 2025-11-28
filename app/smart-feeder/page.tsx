import { cookies } from "next/headers";
import SmartFeederPageClient from "@/app/smart-feeder/SmartFeederPage";

export default async function SmartFeederPage() {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return <SmartFeederPageClient defaultCollapsed={defaultCollapsed} />;
}