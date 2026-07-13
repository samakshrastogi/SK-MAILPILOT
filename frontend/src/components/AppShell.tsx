import {
  FiBell,
  FiChevronDown,
  FiGrid,
  FiHelpCircle,
  FiMail,
  FiRefreshCcw,
  FiSend,
  FiClipboard,
  FiCheckCircle,
  FiExternalLink,
  FiLogOut,
  FiUser,
  FiShield,
  FiUsers,
} from "react-icons/fi";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { AuthUser, GmailAccount } from "../types/auth";
import type { AppRoute } from "../hooks/useHashRoute";
import type { AppNotification } from "../types/email";
import { CENTRAL_PROFILE_URL } from "../api/client";

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
  { route: "audit-center", label: "Audit", icon: FiClipboard, accessRequired: "audit" },
  { route: "team", label: "Team", icon: FiUsers, accessRequired: "team" },
];

type AppShellProps = {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  onRefresh: () => void;
  refreshing: boolean;
  user: AuthUser;
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
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  route,
  navigate,
  onRefresh,
  refreshing,
  user,
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
  onLogout,
  children,
}: AppShellProps) {
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const accountScopeRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const navItems = navItemsConfig.filter((item) => {
    if (item.accessRequired === "requests") {
      return canViewMailAccessRequests;
    }
    if (item.accessRequired === "audit") {
      return canViewAuditCenter;
    }
    if (item.accessRequired === "team") {
      return canManageTeam;
    }
    return true;
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
      if (accountScopeRef.current && !accountScopeRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const actionBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm shadow-sm transition-all duration-200 hover:scale-105 hover:bg-slate-50 hover:shadow-md active:bg-slate-100 sm:h-10 sm:w-10 sm:rounded-xl sm:text-base";

  const primaryBtn =
    "inline-flex h-8 w-8 items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-slate-800 hover:shadow-lg active:bg-slate-950 sm:h-10 sm:w-auto sm:rounded-xl sm:px-3.5";
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
          <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-4">

            {/* TOP BAR */}
            <div className="flex items-center justify-between gap-2">

              {/* LEFT: LOGO + NAME */}
              <div className="flex min-w-0 items-center gap-2 group sm:gap-3">
                {/* Logo */}
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg 
    bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 
    text-xs font-semibold text-white shadow-md 
    group-hover:shadow-lg group-hover:scale-105 
    transition-all duration-200 sm:h-10 sm:w-10 sm:rounded-xl sm:text-base"
                >
                  SK

                  {/* subtle glow */}
                  <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 transition-opacity group-hover:opacity-100 sm:rounded-xl" />
                </div>

                {/* Title */}
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-sky-600 sm:text-[10px] sm:tracking-[0.32em]">
                    SK MailPilot
                  </p>
                  <h1 className="hidden truncate text-base font-semibold tracking-tight text-slate-900 
    min-[380px]:block sm:text-lg
    group-hover:text-blue-600 transition-colors duration-200"
                  >
                    Mail Operations
                  </h1>
                </div>
              </div>
              {/* RIGHT: ACTIONS */}
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">

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
                    <div className="fixed left-3 right-3 top-[4.75rem] z-[100] max-h-[calc(100vh-5.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-[min(380px,calc(100vw-2rem))] sm:max-h-none">

                      {/* Header */}
                      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:px-5 sm:py-4">
                        <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-900">
                          Notifications
                        </p>

                        {notifications.length > 0 && (
                          <button
                            onClick={onReadAllNotifications}
                            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-all hover:bg-blue-50 hover:text-blue-700 sm:px-3"
                          >
                            Mark all
                          </button>
                        )}
                      </div>

                      {/* List */}
                      <div className="max-h-[calc(100vh-9.5rem)] divide-y divide-slate-100 overflow-y-auto sm:max-h-96">
                        {notifications.length ? (
                          notifications.map((n) => (
                            <button
                              key={n._id}
                              onClick={() => {
                                setNotificationMenuOpen(false);
                                onReadNotification(n);
                              }}
                              className={`group relative w-full min-w-0 px-3 py-3 text-left transition-all duration-150 sm:px-5 sm:py-4
              ${n.readAt
                                  ? "bg-white text-slate-500"
                                  : "bg-blue-50/40 text-slate-900"
                                }
              hover:bg-slate-50 active:scale-[0.995]
            `}
                            >
                              {/* Unread indicator */}
                              {!n.readAt && (
                                <span className="absolute left-2 top-4 h-2 w-2 rounded-full bg-blue-500 sm:left-3 sm:top-5"></span>
                              )}

                              <div className="min-w-0 pl-3">
                                <p className="truncate text-sm font-semibold leading-tight">
                                  {n.title}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-600">
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
                <div ref={profileMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationMenuOpen(false);
                      setAccountMenuOpen(false);
                      setProfileMenuOpen((current) => !current);
                    }}
                    title="Open account menu"
                    aria-expanded={profileMenuOpen}
                    className="h-9 w-9 overflow-hidden rounded-lg border border-slate-200 shadow-sm transition-all duration-200 hover:scale-110 hover:shadow-md sm:h-10 sm:w-10 sm:rounded-xl"
                  >
                    {user.avatarUrl && !avatarBroken ? (
                      <img src={user.avatarUrl} onError={() => setAvatarBroken(true)} className="h-full w-full object-cover" alt={user.name} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-semibold text-white">
                        {user.avatarInitials || getUserInitials(user.name)}
                      </div>
                    )}
                  </button>
                  {profileMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.6rem)] z-[110] w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                      <div className="border-b border-slate-100 p-4">
                        <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                      <div className="p-2">
                        <button type="button" onClick={() => { setProfileMenuOpen(false); navigate("profile"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                          <FiUser className="text-sky-600" /> View profile
                        </button>
                        <a href={CENTRAL_PROFILE_URL} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                          <FiExternalLink className="text-sky-600" /> Manage your SK account
                        </a>
                        <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50">
                          <FiLogOut /> Logout
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE BAR */}
        <section className="relative z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
            <nav
              className="grid w-full gap-1 rounded-xl bg-white/90 p-1 shadow-inner ring-1 ring-slate-200/80 sm:gap-1.5 sm:rounded-2xl sm:p-1.5 lg:w-auto lg:min-w-0"
              style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
              aria-label="Primary"
            >

              {navItems.map(({ route: r, label, icon: Icon }) => {
                const active = route === r;

                return (
                  <button
                    key={r}
                    onClick={() => navigate(r)}
                    className={`flex min-h-8 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-all duration-200 sm:min-h-10 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2.5 lg:px-4
            ${active
                        ? "bg-slate-900 shadow-md text-white"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100"
                      }`}
                  >
                    <Icon className="text-[15px] flex-shrink-0 sm:text-[16px]" />
                    <span className="hidden truncate min-[520px]:inline sm:inline">{label}</span>
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
                }}
                disabled={!accounts.length}
                className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-left shadow-sm transition hover:border-sky-200 hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-14 sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-2"
                title="Select mailbox scope"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm text-sky-700 sm:h-10 sm:w-10 sm:rounded-xl sm:text-base">
                <FiMail />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
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

      <a
        className="fixed bottom-24 right-4 z-50 flex items-center gap-3 rounded-[22px] border border-white/80 bg-white px-5 py-4 text-sm font-bold text-slate-950 shadow-[0_20px_55px_-22px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:shadow-xl"
        href="https://www.linkedin.com/in/samaksh-rastogi-9638b9254/"
        target="_blank"
        rel="noreferrer"
        aria-label="Developed by Samaksh Rastogi on LinkedIn"
      >
        <FiCheckCircle className="text-xl text-cyan-600" />
        <span>Developed by Samaksh Rastogi</span>
      </a>
      {/* MAIN */}
      <main className={`mx-auto max-w-7xl ${route === "chatbot" ? "px-2 py-2 sm:px-4 sm:py-6" : "px-4 py-6"}`}>
        <div className={route === "chatbot" ? "space-y-0" : "space-y-6"}>{children}</div>
      </main>
    </div>
  );
}
