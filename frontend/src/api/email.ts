import type {
  BulkAction,
  ChatResponse,
  EmailAnalytics,
  EmailListParams,
  PendingFollowUps,
  ReplyTone,
  EmailStats,
  FetchEmailsResponse,
  InboxRule,
  PaginatedEmailsResponse,
  ProcessedEmail,
  SyncHistoryEntry,
  SyncProgress,
} from "../types/email";
import type { ApiEnvelope } from "./client";
import { buildQuery, request } from "./client";

type ProcessEmailResponse = ApiEnvelope<{
  category: string | null;
  priority: string | null;
  needsReply: boolean;
  summary: string;
  reply: string | null;
}> & {
  duplicate: boolean;
  savedEmail: ProcessedEmail | null;
};

type DeleteBySenderResponse = {
  success: boolean;
  deletedCount: number;
  sender: string;
  error?: string;
};

export async function listProcessedEmails(params: EmailListParams = {}) {
  return request<PaginatedEmailsResponse>(
    `/api/email${buildQuery({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      accountId: params.accountId,
      includeAllAccounts: params.includeAllAccounts,
      sender: params.sender && params.sender !== "all" ? params.sender : undefined,
      category:
        params.category && params.category !== "all" ? params.category : undefined,
      priority:
        params.priority && params.priority !== "all" ? params.priority : undefined,
      needsReply: params.needsReply ? "true" : undefined,
      search: params.search?.trim() || undefined,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      groupByThread: params.groupByThread,
      sortBy: params.sortBy ?? "latest",
      status: params.status ?? "active",
      mailboxType: params.mailboxType ?? "inbox",
    })}`
  );
}

export async function fetchProcessedEmailsFromGmail(maxResults?: number | "all") {
  return request<FetchEmailsResponse>(
    `/api/email/fetch${buildQuery({
      maxResults: maxResults === undefined ? undefined : String(maxResults),
    })}`
  );
}

export async function processEmail(payload: {
  subject: string;
  from: string;
  body: string;
}) {
  return request<ProcessEmailResponse>("/api/email/process", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmailsBySender(
  sender: string,
  options?: { accountId?: string | null; includeAllAccounts?: boolean }
) {
  return request<DeleteBySenderResponse>(
    `/api/email/delete-by-sender${buildQuery({
      email: sender,
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    })}`,
    {
      method: "DELETE",
    }
  );
}

export async function deleteEmailById(id: number) {
  return request<ApiEnvelope<ProcessedEmail>>(`/api/email/${id}`, {
    method: "DELETE",
  });
}

export async function sendReplyNowById(
  id: number,
  payload?: { reply?: string; style?: ReplyTone; attachments?: Array<{ filename: string; mimeType: string; size: number; dataBase64: string }> }
) {
  return request<ApiEnvelope<ProcessedEmail>>(`/api/email/${id}/reply/send`, {
    method: "POST",
    body: JSON.stringify({
      reply: payload?.reply,
      style: payload?.style,
      attachments: payload?.attachments,
    }),
  });
}

export async function generateReplyDraftById(id: number, style: ReplyTone) {
  return request<ApiEnvelope<ProcessedEmail>>(`/api/email/${id}/reply/generate`, {
    method: "POST",
    body: JSON.stringify({
      style,
    }),
  });
}

export async function scheduleReplyById(
  id: number,
  payload: { reply?: string; sendAt: string; style?: ReplyTone; attachments?: Array<{ filename: string; mimeType: string; size: number; dataBase64: string }> }
) {
  return request<ApiEnvelope<ProcessedEmail>>(`/api/email/${id}/reply/schedule`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEmailStats(options?: {
  accountId?: string | null;
  includeAllAccounts?: boolean;
}) {
  return request<ApiEnvelope<EmailStats>>(
    `/api/email/stats${buildQuery({
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    })}`
  );
}

export async function getEmailAnalytics(options?: {
  accountId?: string | null;
  includeAllAccounts?: boolean;
}) {
  return request<ApiEnvelope<EmailAnalytics>>(
    `/api/email/analytics${buildQuery({
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    })}`
  );
}

export async function getPendingFollowUps(options?: {
  accountId?: string | null;
  includeAllAccounts?: boolean;
}) {
  return request<ApiEnvelope<PendingFollowUps>>(
    `/api/email/follow-ups${buildQuery({
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    })}`
  );
}

export async function semanticSearchEmails(
  query: string,
  limit = 20,
  options?: { accountId?: string | null; includeAllAccounts?: boolean }
) {
  return request<PaginatedEmailsResponse>("/api/email/semantic-search", {
    method: "POST",
    body: JSON.stringify({
      query,
      limit,
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    }),
  });
}

export async function generatePendingFollowUpReplies(payload?: {
  limit?: number;
  style?: ReplyTone;
  accountId?: string | null;
  includeAllAccounts?: boolean;
}) {
  return request<
    ApiEnvelope<{
      generatedCount: number;
      emails: ProcessedEmail[];
    }>
  >("/api/email/follow-ups/generate-replies", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function chatWithInbox(
  message: string,
  options?: {
    accountId?: string | null;
    includeAllAccounts?: boolean;
    history?: Array<{ role: "user" | "assistant"; message: string }>;
  }
) {
  return request<ApiEnvelope<ChatResponse>>("/api/email/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
      history: options?.history,
    }),
  });
}

export async function fetchProcessedEmailsFromScopedInbox(options?: {
  maxResults?: number | "all";
  accountId?: string;
  includeAllAccounts?: boolean;
  labelIds?: string;
}) {
  return request<FetchEmailsResponse>(
    `/api/email/fetch${buildQuery({
      maxResults: options?.maxResults === undefined ? undefined : String(options.maxResults),
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
      labelIds: options?.labelIds,
    })}`
  );
}

export async function bulkEmailAction(payload: {
  action: BulkAction;
  ids: number[];
  style?: ReplyTone;
  accountId?: string;
  includeAllAccounts?: boolean;
}) {
  return request<
    ApiEnvelope<{
      action: BulkAction;
      count: number;
      emails: ProcessedEmail[];
    }>
  >("/api/email/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInboxSyncProgress() {
  return request<ApiEnvelope<SyncProgress>>("/api/email/sync-progress");
}

export async function listSyncHistory(
  limit = 20,
  options?: { accountId?: string | null; includeAllAccounts?: boolean }
) {
  return request<ApiEnvelope<SyncHistoryEntry[]>>(
    `/api/email/sync-history${buildQuery({
      limit,
      accountId: options?.accountId,
      includeAllAccounts: options?.includeAllAccounts,
    })}`
  );
}

export async function listInboxRules() {
  return request<ApiEnvelope<InboxRule[]>>("/api/email/rules");
}

export async function createInboxRule(payload: Omit<InboxRule, "id" | "createdAt" | "updatedAt">) {
  return request<ApiEnvelope<InboxRule>>("/api/email/rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateInboxRule(id: string, payload: Omit<InboxRule, "id" | "createdAt" | "updatedAt">) {
  return request<ApiEnvelope<InboxRule>>(`/api/email/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteInboxRule(id: string) {
  return request<ApiEnvelope<{ id: string }>>(`/api/email/rules/${id}`, {
    method: "DELETE",
  });
}
