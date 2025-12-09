import { cookies } from "next/headers";
import DevicesPageClient from "./DevicesPage";

export default async function DevicesPage() {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return <DevicesPageClient defaultCollapsed={defaultCollapsed} />;
}
