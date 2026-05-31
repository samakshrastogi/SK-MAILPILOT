import {
  FiBell,
  FiChevronDown,
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

import type { AuthUser, GmailAccount } from "../types/auth";
import type { AppRoute } from "../hooks/useHashRoute";
import type { AppNotification } from "../types/email";

function getUserInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const navItemsConfig: Array<{
  route: AppRoute;
  label: string;
  icon: typeof FiGrid;
  accessRequired?: "requests" | "audit" | "team";
}> = [
  { route: "dashboard", label: "Overview", icon: FiGrid },
  { route: "emails", label: "Emails", icon: FiMail },
  { route: "compose", label: "Compose", icon: FiSend },
  { route: "mail-access", label: "Request", icon: FiShield, accessRequired: "requests" },
  { route: "audit-center", label: "Audit", icon: FiShield, accessRequired: "audit" },
  { route: "team", label: "Team", icon: FiUsers, accessRequired: "team" },
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
  accounts: GmailAccount[];
  selectedAccountId: string | null;
  includeAllAccounts: boolean;
  onAccountScopeChange: (value: string) => void;
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
  accounts,
  selectedAccountId,
  includeAllAccounts,
  onAccountScopeChange,
  pendingMailAccessCount = 0,
  children,
}: AppShellProps) {
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const accountScopeRef = useRef<HTMLDivElement | null>(null);

  const navItems = navItemsConfig.map((item) => {
    const locked =
      (item.accessRequired === "requests" && !canViewMailAccessRequests) ||
      (item.accessRequired === "audit" && !canViewAuditCenter) ||
      (item.accessRequired === "team" && !canManageTeam);

    return { ...item, locked };
  });

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
      if (accountScopeRef.current && !accountScopeRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const actionBtn =
    "h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105";

  const primaryBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-950 transition-all duration-200 shadow-md hover:shadow-lg";
  const accountScopeValue = includeAllAccounts ? "all" : selectedAccountId ?? "all";
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const accountScopeLabel = accountScopeValue === "all" ? "All emails" : selectedAccount?.email ?? "All emails";
  const accountScopeOptions = [
    { value: "all", label: "All emails" },
    ...accounts.map((account) => ({ value: account.id, label: account.email })),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">

      {/* HEADER */}
      <div className="sticky top-0 z-50 shadow-sm">
        <header className="relative z-[80] border-b border-slate-200 bg-white/85 backdrop-blur-lg">
          <div className="mx-auto max-w-7xl px-4 py-4">

            {/* TOP BAR */}
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
                <div className="relative z-[90]" ref={notificationRef}>
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
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[100] w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

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
                              onClick={() => {
                                setNotificationMenuOpen(false);
                                onReadNotification(n);
                              }}
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
          </div>
        </header>

        {/* WORKSPACE BAR */}
        <section className="relative z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto rounded-2xl bg-white/90 p-1.5 shadow-inner ring-1 ring-slate-200/80" aria-label="Primary">

              {navItems.map(({ route: r, label, icon: Icon, locked }) => {
                const active = route === r;

                return (
                  <button
                    key={r}
                    onClick={() => navigate(r)}
                    title={locked ? "Access is restricted for this section" : undefined}
                    className={`flex min-w-fit items-center gap-2 px-3 py-2.5 sm:px-4 rounded-xl text-xs sm:text-sm whitespace-nowrap transition-all duration-200 font-medium min-h-10
            ${active
                        ? "bg-slate-900 shadow-md text-white"
                        : locked
                          ? "text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:bg-slate-100"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100"
                      }`}
                  >
                    <Icon className="text-[16px] flex-shrink-0" />
                    <span>{label}</span>
                    {r === "mail-access" && pendingMailAccessCount > 0 ? (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {pendingMailAccessCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}

            </nav>

            <div ref={accountScopeRef} className="relative lg:w-[360px]">
              <button
                type="button"
                onClick={() => {
                  if (!accounts.length) {
                    return;
                  }
                  setAccountMenuOpen((current) => !current);
                  setNotificationMenuOpen(false);
                  setProfileMenuOpen(false);
                }}
                disabled={!accounts.length}
                className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-left shadow-sm transition hover:border-sky-200 hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                title="Select mailbox scope"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <FiMail />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 sm:text-base">
                  {accounts.length ? accountScopeLabel : "No synced mailboxes"}
                </span>
                <FiChevronDown
                  className={`shrink-0 text-slate-400 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {accountMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="max-h-72 overflow-y-auto p-1.5">
                    {accountScopeOptions.map((option) => {
                      const selected = option.value === accountScopeValue;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            onAccountScopeChange(option.value);
                            setAccountMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                            selected
                              ? "bg-slate-900 text-white"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                          }`}
                        >
                          <span className="truncate">{option.label}</span>
                          {selected ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-300" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* MAIN */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}
