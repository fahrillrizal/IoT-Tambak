import { cookies } from "next/headers";
import PasswordPage from "@/app/settings/password/PasswordPage";

export default async function PasswordResetPage() {
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_collapsed");
  const defaultCollapsed = sidebarState ? sidebarState.value === "true" : false;

  return <PasswordPage defaultCollapsed={defaultCollapsed} />;
}
