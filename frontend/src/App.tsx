import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiMail, FiRefreshCcw, FiX } from "react-icons/fi";

import {
  forgotPassword,
  getCurrentUser,
  loginWithPassword,
  registerWithPassword,
  resetPassword,
  resendOtp,
  startGoogleLogin,
  updateProfile,
  verifyOtp,
} from "./api/auth";
import { listGmailAccounts, startGoogleAccountConnect } from "./api/account";
import { getInboxSyncProgress } from "./api/email";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api/notifications";
import {
  listMyMailAccessRequests,
  listMailAccessRequests,
  startMailAccessRequest,
} from "./api/mail-access";
import { ApiRequestError, getAuthToken, getStoredAuthUser, setAuthToken, setStoredAuthUser } from "./api/client";
import { AppShell } from "./components/AppShell";
import { FetchInboxModal } from "./components/FetchInboxModal";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { MailAccessModal } from "./components/MailAccessModal";
import { useHashRoute } from "./hooks/useHashRoute";
import { useMailPilotData } from "./hooks/useMailPilotData";
import { useRealtimeStream } from "./hooks/useRealtimeStream";
import { AuditCenterPage } from "./pages/AuditCenterPage";
import { AuthPage } from "./pages/AuthPage";
import { ChatbotPage } from "./pages/ChatbotPage";
import { ComposePage } from "./pages/ComposePage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmailsPage } from "./pages/EmailsPage";
import { MailAccessRequestsPage } from "./pages/MailAccessRequestsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SenderInsightsPage } from "./pages/SenderInsightsPage";
import { SyncHistoryPage } from "./pages/SyncHistoryPage";
import { TeamPage } from "./pages/TeamPage";
import { TutorialPage } from "./pages/TutorialPage";
import type { AuthUser, GmailAccount, MailAccessRequest } from "./types/auth";
import type { AppNotification, ChatResponse, SyncProgress } from "./types/email";
import { getRequiredViteEnv } from "./config/env";
import "./mailpilot.css";

const MAIL_ACCESS_ADMIN_EMAIL = getRequiredViteEnv("VITE_MAIL_ACCESS_ADMIN_EMAIL");
const MAIL_ACCESS_SYNC_ERROR = "Connect a Gmail account before syncing inbox emails";
const COMPOSE_PREFILL_STORAGE_KEY = "sk-mailpilot-compose-prefill";

function getOauthAccountId(oauthResult: Record<string, unknown>) {
  const account = oauthResult.account;
  if (!account || typeof account !== "object") {
    return null;
  }

  const id = (account as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

function getOauthAccountEmail(oauthResult: Record<string, unknown>) {
  const account = oauthResult.account;
  if (!account || typeof account !== "object") {
    return null;
  }

  const email = (account as { email?: unknown }).email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

function isGoogleTestingModeError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("access_denied") ||
    normalized.includes("redirect_uri_mismatch") ||
    normalized.includes("google verification process") ||
    normalized.includes("this app's request is invalid") ||
    normalized.includes("cannot connect or sync gmail") ||
    normalized.includes("testing mode")
  );
}

function isScopeReconnectError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("insufficient authentication scope") ||
    normalized.includes("send-capable scope")
  );
}

function readStoredOauthResult() {
  const searchParams = new URLSearchParams(window.location.search);
  const raw = searchParams.get("oauthResult");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    searchParams.delete("oauthResult");
    const nextSearch = searchParams.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
    return parsed;
  } catch {
    return null;
  }
}

function getVisibleProcessedCount(syncProgress: SyncProgress | null) {
  if (!syncProgress) {
    return 0;
  }

  return syncProgress.processedCount + syncProgress.skippedCount;
}

function getSyncDisplayProgress(input: {
  syncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncResult: ReturnType<typeof useMailPilotData>["lastSyncResult"];
}) {
  const processedCount = input.syncing
    ? getVisibleProcessedCount(input.syncProgress)
    : (input.lastSyncResult?.processedCount ?? 0) + (input.lastSyncResult?.skippedCount ?? 0);

  const totalCount = input.syncing
    ? input.syncProgress?.totalEstimated ?? 0
    : input.syncProgress?.totalEstimated ??
      input.lastSyncResult?.fetchedCount ??
      processedCount + (input.lastSyncResult?.failedCount ?? 0);

  const percentage =
    totalCount > 0
      ? Math.max(0, Math.min(100, Math.round((processedCount / totalCount) * 100)))
      : input.syncing
        ? 0
        : 100;

  return {
    processedCount,
    totalCount,
    percentage,
  };
}

function getNotificationTargetRoute(notification: AppNotification) {
  const kind = String(notification.metadata?.kind ?? "");

  if (kind === "inbox-sync-complete" || kind === "inbox-sync-failed") {
    return "sync-history" as const;
  }

  if (
    kind === "mail-access-pending" ||
    kind === "mail-access-approved" ||
    kind === "mail-access-rejected" ||
    kind === "mail-access-admin-review"
  ) {
    return "mail-access" as const;
  }

  if (kind === "gmail-connected") {
    return "emails" as const;
  }

  return "dashboard" as const;
}

type FirstSyncPromptProps = {
  open: boolean;
  userEmail: string;
  approvedMailCount: number;
  pendingMailCount: number;
  onClose: () => void;
  onSyncMail: () => void;
};

function FirstSyncPrompt({
  open,
  userEmail,
  approvedMailCount,
  pendingMailCount,
  onClose,
  onSyncMail,
}: FirstSyncPromptProps) {
  if (!open) {
    return null;
  }

  const promptText =
    approvedMailCount > 0
      ? "An approved mailbox is waiting. Connect it now and MailPilot will start the first inbox sync automatically."
      : pendingMailCount > 0
        ? "Your mailbox request is waiting for approval. Open the mail flow to review the next step."
        : "Connect or request Gmail access so MailPilot can fetch your inbox and build your workspace.";

  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/55 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <FiMail />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">
                First sync
              </p>
              <h2 className="mt-1 text-xl font-semibold leading-tight text-slate-900">
                Sync your mail
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close sync prompt"
          >
            <FiX />
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{promptText}</p>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Login:</span> {userEmail}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSyncMail}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <FiRefreshCcw />
            Sync mail
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

async function fetchNotifications(setNotifications: (notifications: AppNotification[]) => void) {
  try {
    const response = await listNotifications();
    setNotifications(response.data);
  } catch {
    setNotifications([]);
  }
}

export default function App() {
  const { route, navigate } = useHashRoute();
  const [initialOauthResult] = useState<Record<string, unknown> | null>(() => readStoredOauthResult());
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getStoredAuthUser<AuthUser>());
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [includeAllAccounts, setIncludeAllAccounts] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [, setConnectingAccount] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [pendingPasswordResetEmail, setPendingPasswordResetEmail] = useState<string | null>(null);
  const [mailAccessModalOpen, setMailAccessModalOpen] = useState(false);
  const [requestingMailAccess, setRequestingMailAccess] = useState(false);
  const [mailAccessRequestedEmail, setMailAccessRequestedEmail] = useState("");
  const [mailAccessRequestMessage, setMailAccessRequestMessage] = useState<string | null>(null);
  const [mailAccessError, setMailAccessError] = useState<string | null>(null);
  const [mailAccessRequests, setMailAccessRequests] = useState<MailAccessRequest[]>([]);
  const [adminPendingMailAccessCount, setAdminPendingMailAccessCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [firstSyncPromptOpen, setFirstSyncPromptOpen] = useState(false);
  const [fetchSelection, setFetchSelection] = useState("all");
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [partialSyncRefreshDone, setPartialSyncRefreshDone] = useState(false);
  const syncCompletionHideTimerRef = useRef<number | null>(null);
  const syncOverviewNavigationRef = useRef<string | null>(null);
  const isMailAccessAdmin = authUser?.email.trim().toLowerCase() === MAIL_ACCESS_ADMIN_EMAIL;
  const canViewAuditCenter = authUser?.role === "admin" || authUser?.role === "reviewer";
  const canManageTeam = authUser?.role === "admin";
  const visibleRoute =
    (route === "mail-access" && !isMailAccessAdmin) ||
    (route === "audit-center" && !canViewAuditCenter) ||
    (route === "team" && !canManageTeam)
      ? "dashboard"
      : route;
  const connectedAccountEmails = useMemo(
    () => new Set(accounts.map((account) => account.email.trim().toLowerCase())),
    [accounts]
  );
  const approvedMailRequests = useMemo(
    () =>
      mailAccessRequests.filter(
        (request) =>
          request.status === "approved" &&
          !connectedAccountEmails.has(request.requestedAccountEmail.trim().toLowerCase())
      ),
    [connectedAccountEmails, mailAccessRequests]
  );
  const pendingMailRequests = useMemo(
    () => mailAccessRequests.filter((request) => request.status === "pending"),
    [mailAccessRequests]
  );
  const pendingApprovalCount = useMemo(
    () =>
      isMailAccessAdmin
        ? adminPendingMailAccessCount
        : mailAccessRequests.filter((request) => request.status === "pending").length,
    [adminPendingMailAccessCount, isMailAccessAdmin, mailAccessRequests]
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  const scope = useMemo(
    () => ({
      accountId: includeAllAccounts ? null : selectedAccountId,
      includeAllAccounts,
      enabled: Boolean(authUser),
    }),
    [authUser, includeAllAccounts, selectedAccountId]
  );

  const mailPilot = useMailPilotData(scope);

  function handleAccountScopeChange(value: string) {
    if (value === "all") {
      setIncludeAllAccounts(true);
      setSelectedAccountId(null);
    } else {
      setIncludeAllAccounts(false);
      setSelectedAccountId(value);
    }

    mailPilot.setPage(1);
    mailPilot.setSenderFilter("all");
    mailPilot.setCategoryFilter("all");
    mailPilot.setPriorityFilter("all");
    mailPilot.setPendingOnly(false);
    mailPilot.setSelectedEmailIds([]);
    mailPilot.setSelectionMode(false);
  }

  useEffect(() => {
    if (!selectedAccountId || accounts.some((account) => account.id === selectedAccountId)) {
      return;
    }

    setSelectedAccountId(null);
    setIncludeAllAccounts(true);
  }, [accounts, selectedAccountId]);

  function hideSyncOverlaySoon(delayMs = 2200) {
    if (syncCompletionHideTimerRef.current) {
      window.clearTimeout(syncCompletionHideTimerRef.current);
    }

    syncCompletionHideTimerRef.current = window.setTimeout(() => {
      setSyncOverlayVisible(false);
      syncCompletionHideTimerRef.current = null;
    }, delayMs);
  }

  useEffect(() => {
    return () => {
      if (syncCompletionHideTimerRef.current) {
        window.clearTimeout(syncCompletionHideTimerRef.current);
      }
    };
  }, []);

  const loadOwnMailAccessRequests = useCallback(async () => {
    try {
      const response = await listMyMailAccessRequests();
      setMailAccessRequests(response.data);
    } catch {
      setMailAccessRequests([]);
    }
  }, []);

  const loadAdminMailAccessSummary = useCallback(async () => {
    if (!isMailAccessAdmin) {
      setAdminPendingMailAccessCount(0);
      return;
    }
    try {
      const adminResponse = await listMailAccessRequests();
      setAdminPendingMailAccessCount(
        adminResponse.data.filter((request) => request.status === "pending").length
      );
    } catch {
      setAdminPendingMailAccessCount(0);
    }
  }, [isMailAccessAdmin]);

  function getReconnectTargetEmail() {
    if (selectedAccount?.email) {
      return selectedAccount.email.toLowerCase();
    }

    if (mailAccessRequestedEmail.trim()) {
      return mailAccessRequestedEmail.trim().toLowerCase();
    }

    return approvedMailRequests[0]?.requestedAccountEmail ?? authUser?.email ?? "";
  }

  useEffect(() => {
    if (!mailPilot.error) {
      return;
    }

    if (
      mailPilot.error.includes(MAIL_ACCESS_SYNC_ERROR) ||
      isGoogleTestingModeError(mailPilot.error) ||
      isScopeReconnectError(mailPilot.error)
    ) {
      if (isScopeReconnectError(mailPilot.error)) {
        setMailAccessRequestedEmail(getReconnectTargetEmail());
        setMailAccessError(
          "This mail needs Gmail permissions again. Select the approved mail below and reconnect it."
        );
      }
      openMailAccessModal(isScopeReconnectError(mailPilot.error));
    }
  }, [mailPilot.error]);

  useEffect(() => {
    const oauthResult = initialOauthResult;
    if (!oauthResult) {
      return;
    }

    void (async () => {
      try {
        if (oauthResult.type === "google-login-success" && oauthResult.token && oauthResult.user) {
          await syncAuthState(String(oauthResult.token), oauthResult.user as AuthUser);
          setAuthError(null);
          return;
        }

        if (oauthResult.type === "google-login-error") {
          setAuthError(String(oauthResult.error ?? "Google login failed"));
          return;
        }

        if (oauthResult.type === "google-account-success") {
          const connectedAccountId = getOauthAccountId(oauthResult);
          const connectedAccountEmail = getOauthAccountEmail(oauthResult);
          let syncAccountId = connectedAccountId;
          try {
            const accountsResponse = await listGmailAccounts();
            setAccounts(accountsResponse.data);
            setFirstSyncPromptOpen(false);
            const syncedAccount =
              accountsResponse.data.find((account) => account.id === connectedAccountId) ??
              accountsResponse.data.find((account) => account.email.trim().toLowerCase() === connectedAccountEmail);
            syncAccountId = syncedAccount?.id ?? syncAccountId;
            setSelectedAccountId(syncedAccount?.id ?? null);
            setIncludeAllAccounts(!syncedAccount);
          } catch {
            setAccounts([]);
            setSelectedAccountId(null);
            setIncludeAllAccounts(true);
          }
          setFetchModalOpen(false);
          setMailAccessModalOpen(false);
          setConnectingAccount(false);
          setSyncOverlayVisible(true);
          await mailPilot.syncInbox(undefined, {
            accountId: syncAccountId,
            includeAllAccounts: !syncAccountId,
          });
          return;
        }

        if (oauthResult.type === "mail-access-request-success") {
          try {
            const [accountsResponse, requestsResponse] = await Promise.all([
              listGmailAccounts(),
              listMyMailAccessRequests(),
            ]);
            setAccounts(accountsResponse.data);
            setSelectedAccountId(null);
            setIncludeAllAccounts(true);
            setMailAccessRequests(requestsResponse.data);
          } catch {
            setAccounts([]);
            setSelectedAccountId(null);
            setIncludeAllAccounts(true);
          }
          setFetchModalOpen(false);
          setMailAccessModalOpen(true);
          setConnectingAccount(false);
          setMailAccessRequestMessage(
            String(oauthResult.status) === "approved"
              ? `Mailbox ${String(oauthResult.requestedAccountEmail ?? "")} is verified and ready to connect.`
              : `Mailbox ${String(oauthResult.requestedAccountEmail ?? "")} is verified with Google and sent for admin approval.`
          );
          setMailAccessError(null);
          await fetchNotifications(setNotifications);
          await mailPilot.refreshAll();
          return;
        }

        if (oauthResult.type === "google-account-error" || oauthResult.type === "mail-access-request-error") {
          const message = String(oauthResult.error ?? "Failed to connect Gmail account");
          setAuthError(message);
          setConnectingAccount(false);
          if (isGoogleTestingModeError(message) || isScopeReconnectError(message)) {
            if (isScopeReconnectError(message)) {
              setMailAccessRequestedEmail(getReconnectTargetEmail());
              setMailAccessError(
                "This mail needs Gmail permissions again. Select the approved mail below and reconnect it."
              );
            }
            openMailAccessModal(isScopeReconnectError(message));
          }
        }
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Google login failed");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [initialOauthResult]);

  useEffect(() => {
    if (!mailPilot.syncing) {
      if (!mailPilot.lastSyncResult) {
        setSyncOverlayVisible(false);
      }
      setPartialSyncRefreshDone(false);
      return;
    }

    if (syncCompletionHideTimerRef.current) {
      window.clearTimeout(syncCompletionHideTimerRef.current);
      syncCompletionHideTimerRef.current = null;
    }
    setSyncOverlayVisible(true);
    void getInboxSyncProgress()
      .then((response) => setSyncProgress(response.data))
      .catch(() => {
        // Realtime stream handles follow-up sync state updates.
      });
  }, [mailPilot.lastSyncResult, mailPilot.syncing]);

  useEffect(() => {
    if (!mailPilot.syncing || !syncProgress || partialSyncRefreshDone) {
      return;
    }

    const thresholdReached =
      syncProgress.partialDataAvailable &&
      syncProgress.totalEstimated > 0 &&
      syncProgress.percentage >= 10;

    if (!thresholdReached) {
      return;
    }

    setPartialSyncRefreshDone(true);
    void Promise.all([
      mailPilot.loadEmails(true),
      mailPilot.loadRecentEmails(),
      mailPilot.loadStats(),
      mailPilot.loadAnalytics(),
      mailPilot.loadFollowUps(),
    ]);
  }, [mailPilot, partialSyncRefreshDone, syncProgress]);

  useEffect(() => {
    const lastSyncResult = mailPilot.lastSyncResult;
    if (
      !lastSyncResult ||
      mailPilot.syncing ||
      !mailPilot.lastSyncAt
    ) {
      return;
    }

    if (syncOverviewNavigationRef.current === mailPilot.lastSyncAt) {
      return;
    }

    syncOverviewNavigationRef.current = mailPilot.lastSyncAt;

    setSyncProgress((current) => ({
      userId: current?.userId ?? authUser?.id ?? "",
      status: "completed",
      phase: "completed",
      fetchedCount: lastSyncResult.fetchedCount,
      processedCount: lastSyncResult.processedCount,
      failedCount: lastSyncResult.failedCount,
      skippedCount: lastSyncResult.skippedCount,
      totalEstimated:
        current?.totalEstimated ??
        lastSyncResult.fetchedCount + lastSyncResult.skippedCount + lastSyncResult.failedCount,
      percentage: 100,
      partialDataAvailable: lastSyncResult.processedCount > 0,
      startedAt: current?.startedAt ?? null,
      completedAt: Date.now(),
      durationMs: lastSyncResult.fetchDurationMs ?? 0,
      message: "Inbox sync complete",
      error: null,
    }));
    setSyncOverlayVisible(true);
    void fetchNotifications(setNotifications);
    if (visibleRoute !== "dashboard") {
      navigate("dashboard");
    }
    hideSyncOverlaySoon();
  }, [authUser?.id, mailPilot.lastSyncAt, mailPilot.lastSyncResult, mailPilot.syncing, navigate, visibleRoute]);

  useEffect(() => {
    if (!authUser) {
      setMailAccessRequests([]);
      setAdminPendingMailAccessCount(0);
      setNotifications([]);
      return;
    }

    void loadOwnMailAccessRequests();
    void loadAdminMailAccessSummary();
    void fetchNotifications(setNotifications);
  }, [authUser, loadAdminMailAccessSummary, loadOwnMailAccessRequests]);

  useRealtimeStream(
    useCallback(
      (event) => {
        if (!authUser) {
          return;
        }

        if (event.event === "sync.progress") {
          setSyncProgress(event.data);
          const isRunning = event.data.status === "running";
          const isCompleted = event.data.status === "completed";
          setSyncOverlayVisible(isRunning || isCompleted);
          if (isCompleted) {
            hideSyncOverlaySoon();
          }
          return;
        }

        if (event.event === "notification.created") {
          const payload = event.data.data as AppNotification;
          setNotifications((current) => [payload, ...current.filter((item) => item._id !== payload._id)].slice(0, 50));
          const kind = String(payload.metadata?.kind ?? "");
          if (kind.startsWith("mail-access")) {
            void loadOwnMailAccessRequests();
            void loadAdminMailAccessSummary();
          }
          if (kind.startsWith("inbox-sync")) {
            void mailPilot.loadStats();
            void mailPilot.loadAnalytics();
            void mailPilot.loadRecentEmails();
            void mailPilot.loadFollowUps();
          }
          return;
        }

        if (event.event === "notification.updated") {
          const payload = event.data.data;
          if (Array.isArray(payload)) {
            setNotifications(payload as AppNotification[]);
            return;
          }
          const notification = payload as AppNotification;
          setNotifications((current) => current.map((item) => (item._id === notification._id ? notification : item)));
          return;
        }

        if (event.event === "compose.updated" && route === "compose") {
          return;
        }
      },
      [authUser, loadAdminMailAccessSummary, loadOwnMailAccessRequests, mailPilot, route]
    ),
    Boolean(authUser)
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (initialOauthResult) {
        setAuthLoading(false);
        return;
      }

      const token = getAuthToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const me = await getCurrentUser();
        if (cancelled) {
          return;
        }

        setAuthUser(me.data.user);
        setStoredAuthUser(me.data.user);
        const accountsResponse = await listGmailAccounts();
        if (cancelled) {
          return;
        }

        setAccounts(accountsResponse.data);
        setSelectedAccountId(null);
        setIncludeAllAccounts(true);
        setAuthError(null);
        const accessResponse = await listMyMailAccessRequests();
        if (!cancelled) {
          setMailAccessRequests(accessResponse.data);
        }
        if (isMailAccessAdmin) {
          try {
            const adminResponse = await listMailAccessRequests();
            if (!cancelled) {
              setAdminPendingMailAccessCount(
                adminResponse.data.filter((request) => request.status === "pending").length
              );
            }
          } catch {
            if (!cancelled) {
              setAdminPendingMailAccessCount(0);
            }
          }
        }
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          setAuthToken(null);
          setStoredAuthUser(null);
          setAuthUser(null);
          setAccounts([]);
          setPendingVerificationEmail(null);
          setPendingPasswordResetEmail(null);
          setAuthError(error.message);
          setMailAccessRequests([]);
          setAdminPendingMailAccessCount(0);
          setNotifications([]);
        } else {
          setAuthError(error instanceof Error ? error.message : "Unable to restore session");
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [initialOauthResult]);

  async function syncAuthState(token: string, user: AuthUser) {
    setAuthToken(token);
    setAuthUser(user);
    setStoredAuthUser(user);
    try {
      const accountsResponse = await listGmailAccounts();
      setAccounts(accountsResponse.data);
      setFirstSyncPromptOpen(accountsResponse.data.length === 0);
      setSelectedAccountId(null);
      setIncludeAllAccounts(true);
    } catch {
      setAccounts([]);
      setFirstSyncPromptOpen(false);
      setSelectedAccountId(null);
      setIncludeAllAccounts(true);
    }
    setPendingVerificationEmail(null);
    setPendingPasswordResetEmail(null);
    setMailAccessRequestMessage(null);
    setMailAccessError(null);
    setMailAccessRequestedEmail(user.email);
    try {
      const accessResponse = await listMyMailAccessRequests();
      setMailAccessRequests(accessResponse.data);
    } catch {
      setMailAccessRequests([]);
    }
    if (user.email.trim().toLowerCase() === MAIL_ACCESS_ADMIN_EMAIL) {
      try {
        const adminResponse = await listMailAccessRequests();
        setAdminPendingMailAccessCount(
          adminResponse.data.filter((request) => request.status === "pending").length
        );
      } catch {
        setAdminPendingMailAccessCount(0);
      }
    } else {
      setAdminPendingMailAccessCount(0);
    }

    try {
      const notificationResponse = await listNotifications();
      setNotifications(notificationResponse.data);
    } catch {
      setNotifications([]);
    }
  }

  function openMailAccessModal(preserveError = false) {
    setMailAccessModalOpen(true);
    if (!preserveError) {
      setMailAccessError(null);
    }
    setMailAccessRequestMessage(null);
    setMailAccessRequestedEmail((current) => current || authUser?.email || "");
  }

  function handleFirstSyncPromptAction() {
    setFirstSyncPromptOpen(false);
    setMailAccessModalOpen(true);
    setMailAccessError(null);
    setMailAccessRequestMessage(null);
    setMailAccessRequestedEmail(
      approvedMailRequests[0]?.requestedAccountEmail || mailAccessRequestedEmail || authUser?.email || ""
    );
  }

  function handleRequestedEmailChange(value: string) {
    setMailAccessRequestedEmail(value);
    setMailAccessRequestMessage(null);
    setMailAccessError(null);
  }

  async function handleStartMailAccessRequest() {
    setRequestingMailAccess(true);
    try {
      const normalizedEmail = mailAccessRequestedEmail.trim().toLowerCase();
      const response = await startMailAccessRequest({
        requestedAccountEmail: normalizedEmail,
      });
      if (!response.data.authUrl) {
        try {
          const [accountsResponse, requestsResponse] = await Promise.all([
            listGmailAccounts(),
            listMyMailAccessRequests(),
          ]);
          setAccounts(accountsResponse.data);
          const matchingAccount = accountsResponse.data.find(
            (account) => account.email.trim().toLowerCase() === normalizedEmail
          );
          setSelectedAccountId(matchingAccount?.id ?? null);
          setIncludeAllAccounts(!matchingAccount);
          setMailAccessRequests(requestsResponse.data);
        } catch {
          // Leave current UI state if refresh fails; the direct connect action remains available.
        }
        const requestStatus = response.data.requestStatus;
        setMailAccessRequestMessage(
          response.data.alreadyApproved || requestStatus === "approved"
            ? `Mailbox ${response.data.requestedAccountEmail} is already approved and ready to connect.`
            : `Mailbox ${response.data.requestedAccountEmail} is sent for admin approval.`
        );
        setMailAccessError(null);
        await fetchNotifications(setNotifications);
        return;
      }
      window.location.assign(response.data.authUrl);
      setMailAccessError(null);
    } catch (error) {
      setMailAccessError(
        error instanceof Error ? error.message : "Failed to start Google mailbox verification"
      );
    } finally {
      setRequestingMailAccess(false);
    }
  }

  async function handlePasswordAuth(
    kind: "login" | "register" | "forgot",
    payload:
      | { email: string; password: string }
      | { name: string; email: string; password: string }
      | { email: string }
  ) {
    setAuthLoading(true);
    try {
      if (kind === "register") {
        const response = await registerWithPassword(
          payload as { name: string; email: string; password: string }
        );
        setPendingVerificationEmail(response.data.email);
        setPendingPasswordResetEmail(null);
      } else {
        if (kind === "forgot") {
          const response = await forgotPassword(payload as { email: string });
          setPendingPasswordResetEmail(response.data.email);
          setPendingVerificationEmail(null);
        } else {
          const response = await loginWithPassword(payload as { email: string; password: string });
          await syncAuthState(response.data.token, response.data.user);
        }
      }
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setAuthLoading(true);
    try {
      const response = await startGoogleLogin(window.location.hash.replace(/^#/, "") || "/dashboard");
      window.location.assign(response.data.authUrl);
      return;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google login failed");
      setAuthLoading(false);
    }
  }

  async function handleConnectAccount() {
    const requestedEmail = mailAccessRequestedEmail.trim().toLowerCase();

    if (connectedAccountEmails.has(requestedEmail)) {
      setMailAccessModalOpen(false);
      setFetchModalOpen(false);
      setMailAccessError(null);
      setMailAccessRequestMessage(null);
      return;
    }

    if (!isMailAccessAdmin && approvedMailRequests.length === 0) {
      openMailAccessModal();
      return;
    }

    if (!isMailAccessAdmin && !approvedMailRequests.some(
      (request) => request.requestedAccountEmail === requestedEmail
    )) {
      openMailAccessModal();
      return;
    }

    setConnectingAccount(true);
    try {
      const response = await startGoogleAccountConnect(
        isMailAccessAdmin ? undefined : requestedEmail,
        window.location.hash.replace(/^#/, "") || "/emails"
      );
      window.location.assign(response.data.authUrl);
      return;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect Gmail account";
      setAuthError(message);
      if (isGoogleTestingModeError(message) || isScopeReconnectError(message)) {
        if (isScopeReconnectError(message)) {
          setMailAccessRequestedEmail(getReconnectTargetEmail());
          setMailAccessError(
            "This mail needs Gmail permissions again. Select the approved mail below and reconnect it."
          );
        }
        openMailAccessModal(isScopeReconnectError(message));
      }
    } finally {
      if (!document.hidden) {
        setConnectingAccount(false);
      }
    }
  }

  function applyFetchSelection(value: string) {
    setFetchSelection(value);
    if (value === "all") {
      setIncludeAllAccounts(true);
      setSelectedAccountId(null);
      return;
    }

    setIncludeAllAccounts(false);
    setSelectedAccountId(value);
  }

  async function handleRefresh() {
    if (!accounts.length) {
      if (approvedMailRequests.length) {
        setMailAccessRequestedEmail((current) => current || approvedMailRequests[0].requestedAccountEmail);
      }
      mailPilot.setError(MAIL_ACCESS_SYNC_ERROR);
      openMailAccessModal();
      return;
    }

    handleOpenFetchModal();
  }

  function handleOpenFetchModal() {
    if (!accounts.length) {
      if (approvedMailRequests.length) {
        setMailAccessRequestedEmail((current) => current || approvedMailRequests[0].requestedAccountEmail);
      }
      mailPilot.setError(MAIL_ACCESS_SYNC_ERROR);
      openMailAccessModal();
      return;
    }

    setFetchSelection(includeAllAccounts ? "all" : selectedAccountId ?? "all");
    setFetchModalOpen(true);
  }

  async function handleConfirmFetch(selection = fetchSelection) {
    applyFetchSelection(selection);
    setFetchModalOpen(false);
    setSyncOverlayVisible(true);
    await mailPilot.syncInbox();
  }

  function handleComposeTo(recipient: string) {
    window.localStorage.setItem(
      COMPOSE_PREFILL_STORAGE_KEY,
      JSON.stringify({
        to: recipient,
      })
    );
    navigate("compose");
  }

  function applyChatUiAction(uiAction: ChatResponse["uiAction"]) {
    if (!uiAction) {
      return;
    }

    switch (uiAction.type) {
      case "navigate":
        navigate(uiAction.route);
        return;
      case "compose":
        if (uiAction.recipient?.trim()) {
          handleComposeTo(uiAction.recipient.trim());
          return;
        }
        navigate("compose");
        return;
      case "open_emails":
        if (uiAction.clearFilters) {
          mailPilot.setSearch("");
          mailPilot.setSenderFilter("all");
          mailPilot.setCategoryFilter("all");
          mailPilot.setPriorityFilter("all");
          mailPilot.setPendingOnly(false);
          mailPilot.setDateFrom("");
          mailPilot.setDateTo("");
          mailPilot.setSortBy("latest");
          mailPilot.setGroupByThread(false);
        } else {
          mailPilot.setSearch("");
          mailPilot.setSenderFilter("all");
          mailPilot.setDateFrom("");
          mailPilot.setDateTo("");
          mailPilot.setGroupByThread(false);
        }

        if (typeof uiAction.pendingOnly === "boolean") {
          mailPilot.setPendingOnly(uiAction.pendingOnly);
        }

        if (uiAction.priority !== undefined) {
          mailPilot.setPriorityFilter(uiAction.priority ?? "all");
        }

        if (uiAction.category !== undefined) {
          mailPilot.setCategoryFilter(uiAction.category ?? "all");
        }

        if (uiAction.sortBy) {
          mailPilot.setSortBy(uiAction.sortBy);
        }

        mailPilot.setPage(1);
        navigate("emails");
        return;
    }
  }

  async function handleChatAssistantRequest(message: string) {
    if (!message.trim()) {
      return;
    }

    const response = await mailPilot.sendChat(message);

    if (!response) {
      return;
    }

    applyChatUiAction(response.uiAction);

    if (response.action === "sync") {
      await handleRefresh();
    }
  }

  async function handleLogout() {
    setAuthToken(null);
    setStoredAuthUser(null);
    setAuthUser(null);
    setAccounts([]);
    setSelectedAccountId(null);
    setIncludeAllAccounts(true);
    setPendingVerificationEmail(null);
    setPendingPasswordResetEmail(null);
    setFetchModalOpen(false);
    setMailAccessModalOpen(false);
    setMailAccessRequestedEmail("");
    setMailAccessRequestMessage(null);
    setMailAccessError(null);
    setMailAccessRequests([]);
    setAdminPendingMailAccessCount(0);
    setNotifications([]);
    setSyncProgress(null);
    setFirstSyncPromptOpen(false);
    window.location.hash = "";
  }

  async function handleSaveProfile(payload: { name: string; avatarUrl: string; coverPhotoUrl: string }) {
    const response = await updateProfile(payload);
    setAuthUser(response.data.user);
    setStoredAuthUser(response.data.user);
  }

  async function handleReadNotification(notification: AppNotification) {
    try {
      const response = await markNotificationRead(notification._id);
      setNotifications((current) =>
        current.map((notification) =>
          notification._id === response.data._id ? response.data : notification
        )
      );
    } catch {
      // Keep UI stable; notification polling will reconcile later.
    }

    const targetRoute = getNotificationTargetRoute(notification);
    if (targetRoute === "emails") {
      const targetEmail =
        typeof notification.metadata?.accountEmail === "string"
          ? notification.metadata.accountEmail.toLowerCase()
          : null;
      if (targetEmail) {
        const matchingAccount = accounts.find((account) => account.email.trim().toLowerCase() === targetEmail);
        if (matchingAccount) {
          setSelectedAccountId(matchingAccount.id);
          setIncludeAllAccounts(false);
        }
      }
      setMailAccessModalOpen(false);
    }

    if (targetRoute === "mail-access" && !isMailAccessAdmin) {
      const requestedEmail =
        typeof notification.metadata?.requestedAccountEmail === "string"
          ? notification.metadata.requestedAccountEmail
          : "";
      if (requestedEmail) {
        setMailAccessRequestedEmail(requestedEmail);
      }
      setMailAccessModalOpen(true);
      navigate("emails");
      return;
    }

    navigate(targetRoute);
  }

  async function handleReadAllNotifications() {
    try {
      const response = await markAllNotificationsRead();
      setNotifications(response.data);
    } catch {
      // Polling reconciles later.
    }
  }

  async function handleVerifyOtp(payload: { email: string; otp: string }) {
    setAuthLoading(true);
    try {
      const response = await verifyOtp(payload);
      await syncAuthState(response.data.token, response.data.user);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "OTP verification failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResendOtp(payload: { email: string }) {
    setAuthLoading(true);
    try {
      const response = await resendOtp(payload);
      setPendingVerificationEmail(response.data.email);
      setPendingPasswordResetEmail(null);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to resend OTP");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPassword(payload: { email: string; otp: string; newPassword: string }) {
    setAuthLoading(true);
    try {
      const response = await resetPassword(payload);
      await syncAuthState(response.data.token, response.data.user);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Password reset failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResendPasswordResetOtp(payload: { email: string }) {
    setAuthLoading(true);
    try {
      const response = await forgotPassword({ email: payload.email });
      setPendingPasswordResetEmail(response.data.email);
      setPendingVerificationEmail(null);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to resend password reset OTP");
    } finally {
      setAuthLoading(false);
    }
  }

  if (authLoading && !authUser) {
    return <div className="min-h-screen bg-slate-950 text-white" />;
  }

  if (!authUser) {
    return (
      <AuthPage
        loading={authLoading}
        error={authError}
        pendingVerificationEmail={pendingVerificationEmail}
        pendingPasswordResetEmail={pendingPasswordResetEmail}
        onLogin={(payload) => handlePasswordAuth("login", payload)}
        onRegister={(payload) => handlePasswordAuth("register", payload)}
        onForgotPassword={(payload) => handlePasswordAuth("forgot", payload)}
        onVerifyOtp={handleVerifyOtp}
        onResendOtp={handleResendOtp}
        onResetPassword={handleResetPassword}
        onResendPasswordResetOtp={handleResendPasswordResetOtp}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  const page =
    visibleRoute === "emails" ? (
      <EmailsPage
        mailPilot={mailPilot}
        onBulkDelete={() => void mailPilot.runBulkAction("delete")}
        onBulkSpam={() => void mailPilot.runBulkAction("spam")}
        onBulkRead={() => void mailPilot.runBulkAction("read")}
        onBulkUnread={() => void mailPilot.runBulkAction("unread")}
        onBulkReply={() => void mailPilot.runBulkAction("generate-reply")}
      />
    ) : visibleRoute === "sender-insights" ? (
      <SenderInsightsPage accountId={scope.accountId} includeAllAccounts={scope.includeAllAccounts} />
    ) : visibleRoute === "sync-history" ? (
      <SyncHistoryPage accountId={scope.accountId} includeAllAccounts={scope.includeAllAccounts} />
    ) : visibleRoute === "compose" ? (
      <ComposePage accounts={accounts} selectedAccountId={scope.accountId} includeAllAccounts={scope.includeAllAccounts} />
    ) : visibleRoute === "chatbot" ? (
      <ChatbotPage
        mailPilot={mailPilot}
        onClose={() => navigate("dashboard")}
        onSubmitRequest={handleChatAssistantRequest}
      />
    ) : visibleRoute === "profile" ? (
      <ProfilePage
        user={authUser}
        accounts={accounts}
        mailAccessRequests={mailAccessRequests}
        notifications={notifications}
        mailPilot={mailPilot}
        onSaveProfile={handleSaveProfile}
        onLogout={() => void handleLogout()}
      />
    ) : visibleRoute === "mail-access" ? (
      <MailAccessRequestsPage canView={isMailAccessAdmin} />
    ) : visibleRoute === "audit-center" ? (
      <AuditCenterPage canView={canViewAuditCenter} />
    ) : visibleRoute === "team" ? (
      <TeamPage canManage={canManageTeam} />
    ) : visibleRoute === "tutorial" ? (
      <TutorialPage />
    ) : (
      <DashboardPage mailPilot={mailPilot} accountId={scope.accountId} includeAllAccounts={scope.includeAllAccounts} />
    );
  const syncDisplayProgress = getSyncDisplayProgress({
    syncing: mailPilot.syncing,
    syncProgress,
    lastSyncResult: mailPilot.lastSyncResult,
  });

  return (
    <AppShell
      route={visibleRoute}
      navigate={navigate}
      onRefresh={() => void handleRefresh()}
      refreshing={mailPilot.refreshing}
      user={authUser}
      canViewMailAccessRequests={isMailAccessAdmin}
      canViewAuditCenter={canViewAuditCenter}
      canManageTeam={canManageTeam}
      notifications={notifications}
      unreadNotificationCount={unreadNotificationCount}
      onReadNotification={(notification) => void handleReadNotification(notification)}
      onReadAllNotifications={() => void handleReadAllNotifications()}
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      includeAllAccounts={includeAllAccounts}
      onAccountScopeChange={handleAccountScopeChange}
      pendingMailAccessCount={pendingApprovalCount}
    >
      {mailPilot.error ? <div className="error-banner">{mailPilot.error}</div> : null}
      {syncOverlayVisible ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div className="w-[320px] rounded-3xl border border-slate-200 bg-white/95 px-6 py-5 text-center shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-blue-600">
              Inbox Sync
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">
                {mailPilot.syncing ? "Syncing inbox..." : "Sync complete"}
            </h3>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {syncDisplayProgress.percentage}%
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {syncDisplayProgress.processedCount} processed of {syncDisplayProgress.totalCount}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                style={{ width: `${syncDisplayProgress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      {page}
      <FirstSyncPrompt
        open={firstSyncPromptOpen && !mailAccessModalOpen && !fetchModalOpen}
        userEmail={authUser.email}
        approvedMailCount={approvedMailRequests.length}
        pendingMailCount={pendingMailRequests.length}
        onClose={() => setFirstSyncPromptOpen(false)}
        onSyncMail={handleFirstSyncPromptAction}
      />
      <FetchInboxModal
        open={fetchModalOpen}
        accounts={accounts}
        selectedValue={fetchSelection}
        loading={mailPilot.syncing}
        onClose={() => setFetchModalOpen(false)}
        onChangeSelection={applyFetchSelection}
        onAddMail={() => {
          setFetchModalOpen(false);
          if (approvedMailRequests.length) {
            setMailAccessRequestedEmail((current) => current || approvedMailRequests[0].requestedAccountEmail);
          }
          openMailAccessModal();
        }}
        onConfirm={() => void handleConfirmFetch()}
      />
      {visibleRoute !== "chatbot" ? (
        <FloatingChatbot
          mailPilot={mailPilot}
          onOpenFullscreen={() => navigate("chatbot")}
          onSubmitRequest={handleChatAssistantRequest}
        />
      ) : null}
      <MailAccessModal
        open={mailAccessModalOpen}
        user={authUser}
        accounts={accounts}
        approvedRequests={approvedMailRequests}
        pendingRequests={pendingMailRequests}
        requestedEmail={mailAccessRequestedEmail}
        requesting={requestingMailAccess}
        requestSentMessage={mailAccessRequestMessage}
        error={mailAccessError}
        reconnectRecommended={Boolean(mailAccessError && isScopeReconnectError(mailAccessError))}
        onClose={() => setMailAccessModalOpen(false)}
        onRequestedEmailChange={handleRequestedEmailChange}
        onStartRequest={handleStartMailAccessRequest}
        onConnectApprovedMail={handleConnectAccount}
        onOpenAdminRequests={isMailAccessAdmin ? () => navigate("mail-access") : undefined}
      />
    </AppShell>
  );
}
