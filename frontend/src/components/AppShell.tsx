import {
  FiBell,
  FiGrid,
  FiHelpCircle,
  FiLogOut,
  FiMail,
  FiRefreshCcw,
  FiSend,
  FiShield,
  FiUsers,
} from "react-icons/fi";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { AuthUser } from "../types/auth";
import type { AppRoute } from "../hooks/useHashRoute";
import type { AppNotification } from "../types/email";

function getUserInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const baseNavItems: Array<{ route: AppRoute; label: string; icon: typeof FiGrid }> = [
  { route: "dashboard", label: "Overview", icon: FiGrid },
  { route: "emails", label: "Emails", icon: FiMail },
  { route: "compose", label: "Compose", icon: FiSend },
];

type AppShellProps = {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  onRefresh: () => void;
  refreshing: boolean;
  user: AuthUser;
  onLogout: () => void;
  canViewMailAccessRequests?: boolean;
  canViewAuditCenter?: boolean;
  canManageTeam?: boolean;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  onReadNotification: (notification: AppNotification) => void;
  onReadAllNotifications: () => void;
  onApproveNotificationRequest?: (requestId: string) => void;
  onRejectNotificationRequest?: (requestId: string) => void;
  pendingMailAccessCount?: number;
  children: ReactNode;
};

export function AppShell({
  route,
  navigate,
  onRefresh,
  refreshing,
  user,
  onLogout,
  canViewMailAccessRequests = false,
  canViewAuditCenter = false,
  canManageTeam = false,
  notifications,
  unreadNotificationCount,
  onReadNotification,
  onReadAllNotifications,
  onApproveNotificationRequest,
  onRejectNotificationRequest,
  pendingMailAccessCount = 0,
  children,
}: AppShellProps) {
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    ...baseNavItems,
    ...(canViewMailAccessRequests ? [{ route: "mail-access" as AppRoute, label: "Requests", icon: FiShield }] : []),
    ...(canViewAuditCenter ? [{ route: "audit-center" as AppRoute, label: "Audit", icon: FiShield }] : []),
    ...(canManageTeam ? [{ route: "team" as AppRoute, label: "Team", icon: FiUsers }] : []),
  ];

  useEffect(() => {
    setAvatarBroken(false);
  }, [user.avatarUrl]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationMenuOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const actionBtn =
    "h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105";

  const primaryBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-950 transition-all duration-200 shadow-md hover:shadow-lg";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">

          {/* TOP BAR */}
          <div>
            <div className="flex items-center justify-between gap-2">

              {/* LEFT: LOGO + NAME */}
              <div className="flex items-center gap-3 min-w-0 group">
                {/* Logo */}
                <div className="relative h-10 w-10 flex items-center justify-center rounded-xl 
    bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 
    text-white font-semibold shadow-md 
    group-hover:shadow-lg group-hover:scale-105 
    transition-all duration-200"
                >
                  SK

                  {/* subtle glow */}
                  <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Title */}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-600">
                    SK MailPilot
                  </p>
                  <h1 className="truncate text-lg font-semibold text-slate-900 tracking-tight 
    group-hover:text-blue-600 transition-colors duration-200"
                  >
                    Mail Operations
                  </h1>
                </div>
              </div>
              {/* NAVIGATION - Hidden on mobile, shown on lg */}
              <div className="hidden lg:flex justify-center">
                <div className="flex gap-1.5 overflow-x-auto bg-slate-100/60 p-1.5 rounded-xl">

                  {navItems.map(({ route: r, label, icon: Icon }) => {
                    const active = route === r;

                    return (
                      <button
                        key={r}
                        onClick={() => navigate(r)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-200 font-medium
              ${active
                            ? "bg-white shadow-md text-slate-900 scale-100"
                            : "text-slate-600 hover:bg-white/60 hover:text-slate-900 hover:scale-105"
                          }`}
                      >
                        <Icon className="text-[15px]" />
                        {label}
                        {label === "Requests" && pendingMailAccessCount > 0 ? (
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {pendingMailAccessCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                </div>
              </div>

              {/* RIGHT: ACTIONS */}
              <div className="flex items-center gap-2">

                <button onClick={onRefresh} className={primaryBtn} title="Sync inbox">
                  <FiRefreshCcw className={refreshing ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">{refreshing ? "Syncing..." : "Sync inbox"}</span>
                </button>

                <button onClick={() => navigate("tutorial")} className={actionBtn} title="Open tutorial">
                  <FiHelpCircle />
                </button>

                {/* NOTIFICATIONS */}
                <div className="relative" ref={notificationRef}>
                  <button
                    onClick={() => {
                      setNotificationMenuOpen((v) => !v);
                      setProfileMenuOpen(false);
                    }}
                    className={`${actionBtn} relative`}
                  >
                    <FiBell />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 text-[10px] font-bold bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                        {Math.min(unreadNotificationCount, 9)}
                      </span>
                    )}
                  </button>

                  {notificationMenuOpen && (
                    <div className="absolute right-0 top-14 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

                      {/* Header */}
                      <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                        <p className="font-semibold text-sm text-slate-900 tracking-tight">
                          Notifications
                        </p>

                        {notifications.length > 0 && (
                          <button
                            onClick={onReadAllNotifications}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Mark all
                          </button>
                        )}
                      </div>

                      {/* List */}
                      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                        {notifications.length ? (
                          notifications.map((n) => (
                            <button
                              key={n._id}
                              onClick={() => onReadNotification(n)}
                              className={`group relative w-full text-left px-5 py-4 transition-all duration-150
              ${n.readAt
                                  ? "bg-white text-slate-500"
                                  : "bg-blue-50/40 text-slate-900"
                                }
              hover:bg-slate-50 active:scale-[0.995]
            `}
                            >
                              {/* Unread indicator */}
                              {!n.readAt && (
                                <span className="absolute left-3 top-5 h-2 w-2 rounded-full bg-blue-500"></span>
                              )}

                              <div className="pl-3">
                                <p className="text-sm font-semibold leading-tight">
                                  {n.title}
                                </p>
                                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                  {n.message}
                                </p>
                                {n.metadata?.kind === "mail-access-admin-review" &&
                                typeof n.metadata.requestId === "string" ? (
                                  <div
                                    className="mt-2 flex gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onApproveNotificationRequest?.(String(n.metadata?.requestId))}
                                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRejectNotificationRequest?.(String(n.metadata?.requestId))}
                                      className="rounded-lg bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                            <div className="text-3xl mb-2">🔔</div>
                            <p className="text-sm font-medium text-slate-600">
                              You're all caught up
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              No new notifications
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* PROFILE */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => {
                      setProfileMenuOpen((v) => !v);
                      setNotificationMenuOpen(false);
                    }}
                    className="h-10 w-10 rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-110"
                  >
                    {user.avatarUrl && !avatarBroken ? (
                      <img
                        src={user.avatarUrl}
                        onError={() => setAvatarBroken(true)}
                        className="h-full w-full object-cover"
                        alt={user.name}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-white text-xs font-semibold">
                        {getUserInitials(user.name)}
                      </div>
                    )}
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 top-12 w-72 max-w-[90vw] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                        <p className="font-semibold text-sm text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{user.email}</p>
                      </div>
                      <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-5 py-3 text-rose-600 hover:bg-rose-50/80 font-medium transition-colors duration-150 border-t border-slate-100"
                      >
                        <FiLogOut className="text-lg" /> Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* NAVIGATION - Mobile: new row below */}
            <div className="lg:hidden w-full mt-4 pt-3 border-t border-slate-100 flex justify-start">
              <div className="flex gap-1.5 overflow-x-auto bg-slate-100/60 p-1.5 rounded-xl w-full">

                {navItems.map(({ route: r, label, icon: Icon }) => {
                  const active = route === r;

                  return (
                    <button
                      key={r}
                      onClick={() => navigate(r)}
                      className={`flex min-w-fit items-center gap-2 px-3 py-2.5 rounded-lg text-xs sm:text-sm whitespace-nowrap transition-all duration-200 font-medium min-h-10
            ${active
                          ? "bg-white shadow-md text-slate-900"
                          : "text-slate-600 hover:bg-white/60 hover:text-slate-900 active:bg-slate-200"
                        }`}
                    >
                      <Icon className="text-[16px] flex-shrink-0" />
                      <span>{label}</span>
                      {label === "Requests" && pendingMailAccessCount > 0 ? (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {pendingMailAccessCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}

              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}
