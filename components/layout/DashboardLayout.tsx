"use client";

import { useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Activity,
  LayoutDashboard,
  Zap,
  History,
  Bell,
  LogOut,
  QrCode,
  Menu,
  Settings,
} from "lucide-react";

export type MenuType = "dashboard" | "smart-feeder" | "history" | "settings";

interface NavItem {
  id: MenuType;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
}

interface DashboardLayoutProps {
  children: ReactNode;
  activeMenu?: MenuType;
  notificationCount?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/" },
  {
    id: "smart-feeder",
    label: "Smart Feeder",
    icon: Zap,
    href: "/smart-feeder",
  },
  { id: "history", label: "History", icon: History, href: "/history" },
];

export default function DashboardLayout({
  children,
  activeMenu = "dashboard",
  notificationCount = 0,
}: DashboardLayoutProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleNavigation = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  const handleLogout = useCallback(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ========== MOBILE (sm-md) ========== */}
      <div className="lg:hidden">
        {/* Top Navbar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40">
          <div className="flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-100 p-1.5">
                <Activity className="h-4 w-4 text-blue-600" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">IoT Tambak</h1>
            </div>

            {/* Right: QR, Notif, Logout */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-gray-600" aria-label="Scan QR Device">
                <QrCode className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
                <Bell className="h-5 w-5 text-gray-600" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {notificationCount}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-gray-600"
                aria-label="Logout"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content (Mobile) */}
        <main className="p-4">{children}</main>

        {/* Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
          <div className="flex items-center justify-around px-2 py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.href)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                    isActive ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => handleNavigation("/settings")}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                activeMenu === "settings" ? "text-blue-600" : "text-gray-600"
              }`}
            >
              <Settings className="h-5 w-5" />
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </nav>
      </div>

      {/* ========== DESKTOP (lg+) ========== */}
      <div className="hidden lg:flex">
        {/* Sidebar */}
        <div className={`${isCollapsed ? "w-20" : "w-64"} shrink-0 transition-all duration-300`}>
          <aside
            className={`${
              isCollapsed ? "w-20" : "w-64"
            } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 h-screen fixed left-0 top-0 overflow-y-auto z-30`}
          >
            {/* Logo */}
            <div className={`flex items-center gap-3 mb-8 ${isCollapsed ? "p-4 justify-center" : "p-6"}`}>
              <div className="rounded-lg bg-blue-100 p-2">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              {!isCollapsed && (
                <h1 className="text-xl font-bold text-gray-900">IoT Tambak</h1>
              )}
            </div>

            {/* Navigation */}
            <nav className={`flex-1 space-y-1 ${isCollapsed ? "px-2" : "px-4"}`}>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeMenu === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.href)}
                    className={`w-full flex items-center ${
                      isCollapsed ? "justify-center px-3" : "gap-3 px-4"
                    } py-3 rounded-lg transition-colors ${
                      isActive ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:bg-gray-100"
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!isCollapsed && <span className="font-medium">{item.label}</span>}
                  </button>
                );
              })}
            </nav>

            {/* User Info */}
            <div className={`border-t border-gray-200 ${isCollapsed ? "p-2" : "p-4"}`}>
              <div
                onClick={() => router.push("/settings")}
                className={`flex cursor-pointer items-center ${
                  isCollapsed ? "justify-center p-2" : "gap-3 p-2"
                } hover:bg-gray-50 rounded-lg transition-colors`}
                title={isCollapsed ? "Pengaturan Akun" : undefined}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={session?.user?.name || "User"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {session?.user?.name?.[0]?.toUpperCase() ||
                          session?.user?.email?.[0]?.toUpperCase() ||
                          "U"}
                      </span>
                    </div>
                  )}
                </div>

                {/* User Details */}
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.email}</p>
                    <p className="text-xs text-gray-500">{session?.user?.username}</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Main Content (Desktop) */}
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-20">
            <div className="flex items-center justify-between">
              {/* Left: Toggle Sidebar */}
              <button
                onClick={toggleSidebar}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-5 w-5 text-gray-600" />
              </button>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {/* Scan QR */}
                <Button variant="ghost" size="sm" className="text-gray-600">
                  <QrCode className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Scan QR Device</span>
                </Button>

                {/* Notifications */}
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-5 w-5 text-gray-600" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {notificationCount}
                    </span>
                  )}
                </Button>

                {/* Logout */}
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-600">
                  <LogOut className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
 
