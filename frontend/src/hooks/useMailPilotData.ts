import { useEffect, useMemo, useState } from "react";

import {
  bulkEmailAction,
  chatWithInbox,
  deleteEmailById,
  deleteEmailsBySender,
  fetchProcessedEmailsFromScopedInbox,
  generatePendingFollowUpReplies,
  generateReplyDraftById,
  getEmailAnalytics,
  getEmailStats,
  getPendingFollowUps,
  listProcessedEmails,
  processEmail,
  scheduleReplyById,
  semanticSearchEmails,
  sendReplyNowById,
} from "../api/email";
import type {
  ComposeAttachmentInput,
  ChatResponse,
  EmailAnalytics,
  EmailAttachment,
  EmailCategory,
  EmailPriority,
  EmailStats,
  PendingFollowUps,
  ProcessedEmail,
  ReplyTone,
  FetchEmailsResponse,
} from "../types/email";

type UseMailPilotDataOptions = {
  accountId?: string | null;
  includeAllAccounts?: boolean;
  enabled?: boolean;
};

const LAST_SYNC_STORAGE_KEY = "sk-mailpilot-last-sync";
const INBOX_FETCH_LIMIT = 100;

function normalizeEmail(email: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    _id: email._id ?? "",
    id: email.id ?? email.numericId ?? 0,
    numericId: email.numericId ?? email.id ?? 0,
    accountId: email.accountId ?? null,
    sender: email.sender ?? "",
    subject: email.subject ?? "(No subject)",
    content: email.content ?? "",
    htmlContent: email.htmlContent ?? null,
    category: email.category ?? "other",
    priority: email.priority ?? "low",
    reply: email.reply ?? null,
    replyTone: email.replyTone ?? "professional",
    replyStatus: email.replyStatus ?? "draft",
    scheduledReplyAt: email.scheduledReplyAt ?? null,
    replySentAt: email.replySentAt ?? null,
    replyError: email.replyError ?? null,
    needsReply: Boolean(email.needsReply),
    replyDueAt: email.replyDueAt ?? null,
    replyRiskStatus:
      email.replyRiskStatus === "at-risk" || email.replyRiskStatus === "overdue" || email.replyRiskStatus === "on-track"
        ? email.replyRiskStatus
        : "none",
    followUpPending:
      typeof email.followUpPending === "boolean"
        ? email.followUpPending
        : Boolean(email.needsReply) && email.replyStatus !== "sent" && email.status !== "deleted",
    summary: email.summary ?? "",
    automationActions: Array.isArray(email.automationActions) ? email.automationActions : [],
    attachments: Array.isArray(email.attachments)
      ? (email.attachments as EmailAttachment[]).map((attachment) => ({
          filename: attachment.filename ?? "attachment",
          mimeType: attachment.mimeType ?? "application/octet-stream",
          size: attachment.size ?? 0,
          attachmentId: attachment.attachmentId ?? null,
          previewUrl: attachment.previewUrl ?? null,
          extractedText: attachment.extractedText ?? null,
          documentType: attachment.documentType ?? "other",
          summary: attachment.summary ?? null,
          keyData: Array.isArray(attachment.keyData) ? attachment.keyData : [],
          importantSections: Array.isArray(attachment.importantSections) ? attachment.importantSections : [],
          extractedFields: Array.isArray(attachment.extractedFields) ? attachment.extractedFields : [],
        }))
      : [],
    messageId: email.messageId ?? "",
    status: email.status ?? "active",
    isRead: Boolean(email.isRead),
    isSpam: Boolean(email.isSpam),
    originalDate: email.originalDate ?? null,
    processedAt: email.processedAt ?? null,
    threadMessageCount:
      typeof email.threadMessageCount === "number" ? email.threadMessageCount : undefined,
    threadParticipants: Array.isArray(email.threadParticipants) ? email.threadParticipants.map(String) : undefined,
    createdAt: email.createdAt ?? new Date(0).toISOString(),
    updatedAt: email.updatedAt ?? new Date(0).toISOString(),
  };
}

export function useMailPilotData(options: UseMailPilotDataOptions = {}) {
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [recentEmails, setRecentEmails] = useState<ProcessedEmail[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [analytics, setAnalytics] = useState<EmailAnalytics | null>(null);
  const [followUps, setFollowUps] = useState<PendingFollowUps | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [search, setSearch] = useState("");
  const [senderFilter, setSenderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<EmailCategory | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<EmailPriority | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "priority" | "sender">("latest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncDurationMs, setLastSyncDurationMs] = useState<number>(() => {
    const raw = window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) {
      return 0;
    }
    try {
      return Number(JSON.parse(raw).durationMs ?? 0);
    } catch {
      return 0;
    }
  });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    const raw = window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw).lastSyncAt ?? null;
    } catch {
      return null;
    }
  });
  const [lastSyncResult, setLastSyncResult] = useState<FetchEmailsResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingSender, setDeletingSender] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [generatingReplyId, setGeneratingReplyId] = useState<number | null>(null);
  const [bulkGeneratingFollowUps, setBulkGeneratingFollowUps] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [mailboxType, setMailboxType] = useState<"inbox" | "sent">("inbox");
  const [semanticMode, setSemanticMode] = useState(false);
  const [groupByThread, setGroupByThread] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ role: "user" | "assistant"; message: string }>>(
    []
  );
  const [selectedEmailIds, setSelectedEmailIds] = useState<number[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const enabled = options.enabled ?? true;

  const scope = useMemo(
    () => ({
      accountId: options.accountId ?? undefined,
      includeAllAccounts: options.includeAllAccounts ?? undefined,
    }),
    [options.accountId, options.includeAllAccounts]
  );

  useEffect(() => {
    if (!lastSyncAt) {
      return;
    }
    window.localStorage.setItem(
      LAST_SYNC_STORAGE_KEY,
      JSON.stringify({
        durationMs: lastSyncDurationMs,
        lastSyncAt,
      })
    );
  }, [lastSyncAt, lastSyncDurationMs]);

  const filters = useMemo(
    () => ({
      page,
      limit,
      sender: senderFilter,
      category: categoryFilter,
      priority: priorityFilter,
      needsReply: pendingOnly || undefined,
      search,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      groupByThread,
      sortBy,
      status: "active" as const,
      mailboxType,
      accountId: scope.accountId,
      includeAllAccounts: scope.includeAllAccounts,
    }),
    [categoryFilter, dateFrom, dateTo, groupByThread, limit, page, pendingOnly, priorityFilter, scope, search, senderFilter, sortBy, mailboxType]
  );

  function applyListResponse(response: { data?: ProcessedEmail[]; senders?: string[]; totalPages?: number; total?: number }) {
    setEmails(Array.isArray(response.data) ? response.data.map(normalizeEmail) : []);
    setSenders(Array.isArray(response.senders) ? response.senders : []);
    setTotalPages(typeof response.totalPages === "number" && response.totalPages > 0 ? response.totalPages : 1);
    setTotalEmails(typeof response.total === "number" ? response.total : 0);
  }

  async function refreshAll(options?: { syncInbox?: boolean; mailboxType?: "inbox" | "sent" }) {
    if (!enabled) {
      return;
    }

    const shouldSyncInbox = options?.syncInbox ?? false;

    if (shouldSyncInbox) {
      setRefreshing(true);
      try {
        const response = await fetchProcessedEmailsFromScopedInbox({
          maxResults: INBOX_FETCH_LIMIT,
          accountId: scope.accountId,
          includeAllAccounts: scope.includeAllAccounts,
          labelIds: (options?.mailboxType ?? mailboxType) === "sent" ? "SENT" : "INBOX",
        });
        setLastSyncDurationMs(response.fetchDurationMs ?? 0);
        setLastSyncAt(new Date().toISOString());
        setLastSyncResult(response);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to fetch emails from Gmail");
      }
    }

    await Promise.all([loadEmails(true), loadStats(), loadRecentEmails(), loadAnalytics(), loadFollowUps()]);
  }

  async function loadEmails(showRefreshing = false) {
    if (!enabled) {
      setEmails([]);
      setSenders([]);
      setTotalPages(1);
      setTotalEmails(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const keywordResponse = await listProcessedEmails(filters);

      if (filters.search.trim() && !filters.groupByThread) {
        const semanticResponse = await semanticSearchEmails(filters.search.trim(), limit, scope);
        const merged = new Map<string, ProcessedEmail>();

        keywordResponse.data.forEach((email) => {
          const normalized = normalizeEmail(email);
          merged.set(normalized._id, normalized);
        });

        semanticResponse.data.forEach((email) => {
          const normalized = normalizeEmail(email);
          if (!merged.has(normalized._id)) {
            merged.set(normalized._id, normalized);
          }
        });

        applyListResponse({
          ...keywordResponse,
          data: Array.from(merged.values()),
        });
      } else {
        applyListResponse(keywordResponse);
      }
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load emails");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadStats() {
    if (!enabled) {
      setStats(null);
      return;
    }

    try {
      const response = await getEmailStats(scope);
      setStats(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load stats");
    }
  }

  async function loadRecentEmails() {
    if (!enabled) {
      setRecentEmails([]);
      return;
    }

    try {
      const response = await listProcessedEmails({
        page: 1,
        limit: 24,
        status: "active",
        ...scope,
      });
      setRecentEmails(response.data.map(normalizeEmail));
    } catch {
      setRecentEmails([]);
    }
  }

  async function loadAnalytics() {
    if (!enabled) {
      setAnalytics(null);
      return;
    }

    try {
      const response = await getEmailAnalytics(scope);
      setAnalytics(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load analytics");
    }
  }

  async function loadFollowUps() {
    if (!enabled) {
      setFollowUps(null);
      return;
    }

    try {
      const response = await getPendingFollowUps(scope);
      setFollowUps(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load follow-ups");
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void loadEmails();
  }, [enabled, filters, limit, semanticMode]);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setRecentEmails([]);
      setAnalytics(null);
      setFollowUps(null);
      return;
    }

    void loadStats();
    void loadRecentEmails();
    void loadAnalytics();
    void loadFollowUps();
  }, [enabled, scope]);

  async function syncInbox(
    mode: number | "all" | undefined = INBOX_FETCH_LIMIT,
    syncScope?: { accountId?: string | null; includeAllAccounts?: boolean }
  ) {
    if (!enabled) {
      return;
    }

    setSyncing(true);
    try {
      const activeScope = syncScope ?? scope;
      const response = await fetchProcessedEmailsFromScopedInbox({
        maxResults: mode === "all" || mode === undefined ? INBOX_FETCH_LIMIT : Math.min(mode, INBOX_FETCH_LIMIT),
        accountId: activeScope.accountId ?? undefined,
        includeAllAccounts: activeScope.includeAllAccounts,
      });
      setLastSyncDurationMs(response.fetchDurationMs ?? 0);
      setLastSyncAt(new Date().toISOString());
      setLastSyncResult(response);
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to fetch emails from Gmail");
    } finally {
      setSyncing(false);
    }
  }

  async function submitManualEmail(payload: { subject: string; from: string; body: string }) {
    if (!enabled) {
      return;
    }

    setSubmitting(true);
    try {
      await processEmail(payload);
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to process email");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeEmail(id: number) {
    if (!enabled) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteEmailById(id);
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete email");
    } finally {
      setDeletingId(null);
    }
  }

  async function removeSender(sender: string) {
    if (!enabled) {
      return;
    }

    setDeletingSender(true);
    try {
      await deleteEmailsBySender(sender, scope);
      setSenderFilter("all");
      setPage(1);
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete sender emails");
    } finally {
      setDeletingSender(false);
    }
  }

  async function runBulkAction(action: "delete" | "spam" | "read" | "unread" | "generate-reply", style?: ReplyTone) {
    if (!enabled) {
      return null;
    }

    const ids = selectedEmailIds.length ? selectedEmailIds : emails.map((email) => email.numericId);
    try {
      const response = await bulkEmailAction({ action, ids, style, ...scope });
      setSelectedEmailIds([]);
      setSelectionMode(false);
      await refreshAll();
      return response.data.emails.map(normalizeEmail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to run bulk action");
      return null;
    }
  }

  async function sendChat(message: string): Promise<ChatResponse | null> {
    if (!enabled) {
      return null;
    }

    setChatLoading(true);
    setChatLog((current) => [...current, { role: "user", message }]);
    const nextHistory = [...chatLog.slice(-9), { role: "user" as const, message }];
    try {
      const response = await chatWithInbox(message, {
        ...scope,
        history: nextHistory,
      });
      setChatLog((current) => [...current, { role: "assistant", message: response.data.message }]);
      setChatLoading(false);
      await refreshAll();
      return response.data;
    } catch (requestError) {
      const errorMessage = requestError instanceof Error ? requestError.message : "Failed to chat with inbox";
      setChatLog((current) => [...current, { role: "assistant", message: errorMessage }]);
      setError(errorMessage);
      return null;
    } finally {
      setChatLoading(false);
    }
  }

  function appendChatMessage(role: "user" | "assistant", message: string) {
    setChatLog((current) => [...current, { role, message }]);
  }

  function clearChatLog() {
    setChatLog([]);
  }

  async function generateReplyDraft(id: number, style: ReplyTone) {
    if (!enabled) {
      return null;
    }

    setGeneratingReplyId(id);
    try {
      const response = await generateReplyDraftById(id, style);
      await refreshAll();
      return response.data;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to generate reply");
      return null;
    } finally {
      setGeneratingReplyId(null);
    }
  }

  async function sendReplyNow(
    id: number,
    reply?: string,
    style?: ReplyTone,
    attachments?: ComposeAttachmentInput[]
  ) {
    if (!enabled) {
      return null;
    }

    setReplyingId(id);
    try {
      const response = await sendReplyNowById(id, { reply, style, attachments });
      await refreshAll();
      return response.data;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to send reply");
      return null;
    } finally {
      setReplyingId(null);
    }
  }

  async function scheduleReply(
    id: number,
    payload: { reply?: string; sendAt: string; style?: ReplyTone; attachments?: ComposeAttachmentInput[] }
  ) {
    if (!enabled) {
      return null;
    }

    setReplyingId(id);
    try {
      const response = await scheduleReplyById(id, payload);
      await refreshAll();
      return response.data;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to schedule reply");
      return null;
    } finally {
      setReplyingId(null);
    }
  }

  async function generateRepliesForFollowUps(style: ReplyTone = "professional") {
    if (!enabled) {
      return;
    }

    setBulkGeneratingFollowUps(true);
    try {
      await generatePendingFollowUpReplies({ style, limit: 10, ...scope });
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to generate follow-up replies");
    } finally {
      setBulkGeneratingFollowUps(false);
    }
  }

  const categoryCounts = useMemo(
    () =>
      recentEmails.reduce<Record<string, number>>((accumulator, email) => {
        accumulator[email.category] = (accumulator[email.category] ?? 0) + 1;
        return accumulator;
      }, {}),
    [recentEmails]
  );

  return {
    emails,
    recentEmails,
    senders,
    stats,
    analytics,
    followUps,
    page,
    setPage,
    limit,
    setLimit,
    totalPages,
    totalEmails,
    search,
    setSearch,
    senderFilter,
    setSenderFilter,
    categoryFilter,
    setCategoryFilter,
    priorityFilter,
    setPriorityFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sortBy,
    setSortBy,
    pendingOnly,
    setPendingOnly,
    mailboxType,
    setMailboxType,
    semanticMode,
    setSemanticMode,
    groupByThread,
    setGroupByThread,
    loading,
    refreshing,
    syncing,
    lastSyncDurationMs,
    lastSyncAt,
    lastSyncResult,
    submitting,
    deletingId,
    deletingSender,
    error,
    setError,
    chatLoading,
    replyingId,
    generatingReplyId,
    bulkGeneratingFollowUps,
    chatLog,
    categoryCounts,
    selectedEmailIds,
    setSelectedEmailIds,
    selectionMode,
    setSelectionMode,
    loadEmails,
    loadStats,
    loadRecentEmails,
    loadAnalytics,
    loadFollowUps,
    syncInbox,
    refreshAll,
    submitManualEmail,
    removeEmail,
    removeSender,
    sendChat,
    appendChatMessage,
    clearChatLog,
    generateReplyDraft,
    generateRepliesForFollowUps,
    sendReplyNow,
    scheduleReply,
    runBulkAction,
  };
}
