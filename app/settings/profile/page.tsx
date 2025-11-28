import { cookies } from "next/headers";
import ProfilePage from "@/app/settings/profile/ProfilePage";

export default async function ProfileSettingsPage() {
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_collapsed");
  const defaultCollapsed = sidebarState ? sidebarState.value === "true" : false;

  return <ProfilePage defaultCollapsed={defaultCollapsed} />;
}
