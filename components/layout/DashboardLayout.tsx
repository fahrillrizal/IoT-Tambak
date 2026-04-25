"use client";

import { useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { DeviceScanModal } from "@/components/DeviceScanModal";
import { useNotifications } from "@/context/NotificationContext";

export type MenuType =
  | "dashboard"
  | "smart-feeder"
  | "history"
  | "settings"
  | "devices";

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
  defaultCollapsed?: boolean;
  notificationItems?: NotificationItem[];
}

type NotificationSeverity = "warning" | "critical";

export interface NotificationItem {
  id: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: string;
  action?: string;
  targetId?: string;
  pondName?: string;
  deviceId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/" },
  {
    id: "smart-feeder",
    label: "Smart Feeder",
    icon: Zap,
    href: "/smart-feeder",
  },
  { id: "devices", label: "Devices", icon: Wifi, href: "/devices" },
  { id: "history", label: "History", icon: History, href: "/history" },
];

export default function DashboardLayout({
  children,
  activeMenu = "dashboard",
  notificationCount = 0,
  defaultCollapsed = false,
  notificationItems = [],
}: DashboardLayoutProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const desktopNotifRef = useRef<HTMLDivElement | null>(null);
  const mobileNotifRef = useRef<HTMLDivElement | null>(null);

  const {
    notifications: globalNotifications,
    dismissNotification,
    clearNotifications,
  } = useNotifications();

  useEffect(() => {
    const timer = setTimeout(() => setTransitionsEnabled(true), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedDesktop = desktopNotifRef.current?.contains(target);
      const clickedMobile = mobileNotifRef.current?.contains(target);
      if (!clickedDesktop && !clickedMobile) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const newState = !prev;
      document.cookie = `sidebar_collapsed=${newState}; path=/; max-age=31536000`;
      return newState;
    });
  }, []);

  const handleNavigation = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleLogout = useCallback(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  const toggleNotifications = useCallback(() => {
    setIsNotifOpen((prev) => !prev);
  }, []);

  const clearAll = useCallback(async () => {
    await clearNotifications();
  }, [clearNotifications]);

  const allNotifications: NotificationItem[] = [
    ...globalNotifications,
    ...notificationItems,
  ].filter(
    (item, index, arr) => index === arr.findIndex((x) => x.id === item.id),
  );

  const visibleNotifications = allNotifications;

  const resolvedCount =
    visibleNotifications.length > 0
      ? visibleNotifications.length
      : notificationCount;

  const handleNotificationClick = useCallback(
    (item: NotificationItem) => {
      dismissNotification(item.targetId);
      setIsNotifOpen(false);

      const deviceId =
        item.deviceId ||
        (() => {
          if (!item.id.startsWith("notif-derived-")) return undefined;
          const match = item.id.match(/^notif-derived-(.+)-\d+$/);
          if (match?.[1]) return match[1];
          return item.id.replace("notif-derived-", "");
        })();

      const params = new URLSearchParams({ period: "today" });
      if (deviceId) params.set("device", deviceId);

      if (item.targetId?.startsWith("alarm-")) {
        params.set("highlight", encodeURIComponent(item.targetId));
      }

      router.push(`/history?${params.toString()}`);
    },
    [dismissNotification, router],
  );

  const renderNotificationPanel = () => {
    if (visibleNotifications.length === 0) {
      return (
        <div className="p-4 text-sm text-gray-500 text-center py-6">
          Tidak ada notifikasi aktif
        </div>
      );
    }

    return (
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
        {visibleNotifications.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNotificationClick(item)}
            className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 shrink-0 w-2 h-2 rounded-full",
                  item.severity === "critical" ? "bg-red-500" : "bg-yellow-400",
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-xs font-semibold uppercase mb-0.5",
                    item.severity === "critical"
                      ? "text-red-600"
                      : "text-yellow-600",
                  )}
                >
                  {item.severity === "critical" ? "Critical" : "Warning"}
                  {item.pondName ? ` · ${item.pondName}` : ""}
                </p>
                <p className="text-sm text-gray-800 line-clamp-2 leading-snug">
                  {item.message}
                </p>
                {item.action ? (
                  <p className="text-xs text-cyan-700 font-medium mt-1">
                    {item.action}
                  </p>
                ) : null}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(item.timestamp).toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderNavItem = (item: NavItem, isMobile: boolean = false) => {
    const Icon = item.icon;
    const isActive = activeMenu === item.id;

    if (isMobile) {
      return (
        <button
          key={item.id}
          onClick={() => handleNavigation(item.href)}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all",
            isActive ? "text-blue-600" : "text-gray-600",
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="text-xs font-medium">{item.label}</span>
        </button>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => handleNavigation(item.href)}
        className={cn(
          "w-full flex items-center py-3 rounded-lg",
          transitionsEnabled && "transition-all",
          isCollapsed ? "justify-center px-3" : "gap-3 px-4",
          isActive
            ? "bg-blue-100 text-blue-600"
            : "text-gray-600 hover:bg-gray-100",
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!isCollapsed && (
          <span className="font-medium flex-1 text-left">{item.label}</span>
        )}
      </button>
    );
  };

  const renderSettingsItem = (isMobile: boolean = false) => {
    const isActive = activeMenu === "settings";
    if (isMobile) {
      return (
        <button
          onClick={() => handleNavigation("/settings")}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all",
            isActive ? "text-blue-600" : "text-gray-600",
          )}
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs font-medium">Settings</span>
        </button>
      );
    }
    return null;
  };

  const notifHeader = (
    <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-900">Notifikasi</p>
        {resolvedCount > 0 && (
          <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">
            {resolvedCount} aktif
          </span>
        )}
      </div>
      {visibleNotifications.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearAll();
          }}
          className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
        >
          Clear semua
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ========== MOBILE ========== */}
      <div className="lg:hidden">
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-100 p-1.5">
                <Activity className="h-4 w-4 text-blue-600" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">IoT Tambak</h1>
            </Link>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600"
                aria-label="Scan QR Device"
                onClick={() => setIsScanModalOpen(true)}
              >
                <QrCode className="h-5 w-5" />
              </Button>
              <div className="relative" ref={mobileNotifRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  aria-label="Notifications"
                  onClick={toggleNotifications}
                >
                  <Bell className="h-5 w-5 text-gray-600" />
                  {resolvedCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {resolvedCount}
                    </span>
                  )}
                </Button>
                {isNotifOpen ? (
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    {notifHeader}
                    {renderNotificationPanel()}
                  </div>
                ) : null}
              </div>
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

        <main className="p-4 pb-24">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
          <div className="flex items-center justify-around px-2 py-2">
            {NAV_ITEMS.map((item) => renderNavItem(item, true))}
            {renderSettingsItem(true)}
          </div>
        </nav>
      </div>

      {/* ========== DESKTOP ========== */}
      <div className="hidden lg:flex">
        <div
          className={cn(
            "shrink-0",
            transitionsEnabled && "transition-all duration-300",
            isCollapsed ? "w-20" : "w-64",
          )}
        >
          <aside
            className={cn(
              "bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto z-30",
              transitionsEnabled && "transition-all duration-300",
              isCollapsed ? "w-20" : "w-64",
            )}
          >
            <Link
              href="/"
              className={cn(
                "flex items-center gap-3 mb-8",
                isCollapsed ? "p-4 justify-center" : "p-6",
              )}
            >
              <div className="rounded-lg bg-blue-100 p-2">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              {!isCollapsed && (
                <h1 className="text-xl font-bold text-gray-900">IoT Tambak</h1>
              )}
            </Link>

            <nav
              className={cn("flex-1 space-y-1", isCollapsed ? "px-2" : "px-4")}
            >
              {NAV_ITEMS.map((item) => renderNavItem(item, false))}
            </nav>

            <div
              className={cn(
                "border-t border-gray-200",
                isCollapsed ? "p-2" : "p-4",
              )}
            >
              <div
                onClick={() => handleNavigation("/settings")}
                className={cn(
                  "flex cursor-pointer items-center rounded-lg transition-colors",
                  isCollapsed ? "justify-center p-2" : "gap-3 p-2",
                  activeMenu === "settings"
                    ? "bg-blue-100"
                    : "hover:bg-gray-50",
                )}
                title={isCollapsed ? "Pengaturan Akun" : undefined}
              >
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative">
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
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        activeMenu === "settings"
                          ? "text-blue-700"
                          : "text-gray-900",
                      )}
                    >
                      {session?.user?.email}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        activeMenu === "settings"
                          ? "text-blue-500"
                          : "text-gray-500",
                      )}
                    >
                      {session?.user?.username || "Pengguna"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="flex-1 flex flex-col min-h-screen">
          <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-20">
            <div className="flex items-center justify-between">
              <button
                onClick={toggleSidebar}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-5 w-5 text-gray-600" />
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-600"
                  onClick={() => setIsScanModalOpen(true)}
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Scan QR Device</span>
                </Button>

                <div className="relative" ref={desktopNotifRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative"
                    onClick={toggleNotifications}
                  >
                    <Bell className="h-5 w-5 text-gray-600" />
                    {resolvedCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {resolvedCount}
                      </span>
                    )}
                  </Button>

                  {isNotifOpen ? (
                    <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      {notifHeader}
                      {renderNotificationPanel()}
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-gray-600"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </div>

      <DeviceScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
      />
    </div>
  );
}
