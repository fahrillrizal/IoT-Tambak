import { cookies } from "next/headers";
import SettingsPageClient from "@/app/settings/SettingsPage";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return <SettingsPageClient defaultCollapsed={defaultCollapsed} />;
}