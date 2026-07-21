export type EmailCategory =
  | "work"
  | "personal"
  | "spam"
  | "finance"
  | "promotions"
  | "updates"
  | "other";
export type EmailPriority = "low" | "medium" | "high";
export type EmailStatus = "active" | "deleted";
export type ReplyStatus = "draft" | "scheduled" | "sent" | "failed";
export type ReplyTone = "professional" | "friendly" | "short" | "detailed";

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  previewUrl: string | null;
  extractedText: string | null;
  documentType: "invoice" | "resume" | "form" | "pdf" | "text" | "image" | "other";
  summary: string | null;
  keyData: string[];
  importantSections: string[];
  extractedFields: Array<{
    label: string;
    value: string;
  }>;
};

export type ProcessedEmail = {
  _id: string;
  id: number;
  numericId: number;
  accountId: string | null;
  sender: string;
  recipients?: string[];
  mailboxType?: "inbox" | "sent";
  subject: string;
  content: string;
  htmlContent: string | null;
  category: EmailCategory;
  priority: EmailPriority;
  reply: string | null;
  replyTone: ReplyTone;
  replyStatus: ReplyStatus;
  scheduledReplyAt: string | null;
  replySentAt: string | null;
  replyError: string | null;
  needsReply: boolean;
  replyDueAt: string | null;
  replyRiskStatus: "none" | "on-track" | "at-risk" | "overdue";
  followUpPending: boolean;
  summary: string;
  automationActions: string[];
  attachments: EmailAttachment[];
  messageId: string;
  status: EmailStatus;
  isRead: boolean;
  isSpam: boolean;
  originalDate: string | null;
  processedAt: string | null;
  threadMessageCount?: number;
  threadParticipants?: string[];
  createdAt: string;
  updatedAt: string;
};

export type EmailListParams = {
  page?: number;
  limit?: number;
  accountId?: string | null;
  includeAllAccounts?: boolean;
  sender?: string;
  category?: EmailCategory | "all";
  priority?: EmailPriority | "all";
  needsReply?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  groupByThread?: boolean;
  sortBy?: "latest" | "oldest" | "priority" | "sender";
  status?: EmailStatus;
  mailboxType?: "inbox" | "sent";
};

export type PaginatedEmailsResponse = {
  success: boolean;
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  senders: string[];
  data: ProcessedEmail[];
};

export type EmailStats = {
  totalEmails: number;
  processedEmails: number;
  remainingEmails: number;
  processingDurationMs: number;
};

export type PendingFollowUps = {
  count: number;
  alert: string;
  overdueCount?: number;
  atRiskCount?: number;
  emails: ProcessedEmail[];
};

export type EmailAnalytics = {
  totals: {
    daily: number;
    weekly: number;
    monthly: number;
    overall: number;
  };
  replyRate: number;
  categoryDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  topSenders: Array<{
    sender: string;
    count: number;
  }>;
  topDomains: Array<{
    domain: string;
    count: number;
  }>;
  senderInsights: Array<{
    sender: string;
    count: number;
    responseRate: number;
    dominantCategory: string;
    autoRules: string[];
  }>;
  priorityBreakdown: Array<{
    priority: "high" | "medium" | "low";
    count: number;
    percentage: number;
  }>;
  insights: string[];
};

export type FetchEmailsResponse = {
  success: boolean;
  requestedCount?: number | "all";
  fetchedCount: number;
  processedCount: number;
  skippedCount: number;
  duplicateCount: number;
  failedCount: number;
  fetchDurationMs?: number;
  savedToDatabaseCount?: number;
  failedEmails: Array<{
    subject: string;
    error: string;
  }>;
  data: ProcessedEmail[];
};

export type ChatResponse = {
  action: string;
  message: string;
  emails: ProcessedEmail[];
  uiAction?:
    | {
        type: "navigate";
        route:
          | "dashboard"
          | "emails"
          | "compose"
          | "chatbot"
          | "mail-access"
          | "sender-insights"
          | "sync-history"
          | "audit-center"
          | "team"
          | "tutorial";
      }
    | {
        type: "open_emails";
        clearFilters?: boolean;
        priority?: EmailPriority | null;
        category?: EmailCategory | null;
        pendingOnly?: boolean | null;
        sortBy?: "latest" | "oldest" | "priority" | "sender" | null;
      }
    | {
        type: "compose";
        recipient?: string | null;
      }
    | null;
};

export type BulkAction =
  | "delete"
  | "spam"
  | "read"
  | "unread"
  | "generate-reply";

export type ComposeAttachmentInput = {
  filename: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

export type ComposeRecurrence = {
  frequency: "none" | "daily" | "weekly" | "monthly";
  interval: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
};

export type ScheduledEmail = {
  _id: string;
  userId: string;
  accountId: string | null;
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  htmlBody: string | null;
  tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";
  timezone: string;
  scheduledAt: string | null;
  nextRunAt: string | null;
  lastSentAt: string | null;
  lastError: string | null;
  recurrence: ComposeRecurrence;
  attachments: ComposeAttachmentInput[];
  createdAt: string;
  updatedAt: string;
};

export type AppNotification = {
  _id: string;
  userId: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  userId: string;
  actorUserId: string | null;
  kind: string;
  title: string;
  status: "success" | "warning" | "error" | "info";
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditCenterData = {
  summary: {
    syncRuns: number;
    pendingApprovals: number;
    sentReplies: number;
    failedSends: number;
    mailboxes: number;
  };
  events: AuditEvent[];
};

export type RealtimeEvent =
  | { event: "connected"; data: Record<string, unknown> }
  | { event: "notification.created" | "notification.updated"; data: { type: string; data: unknown } }
  | { event: "sync.progress"; data: SyncProgress }
  | { event: "mail-access.updated" | "compose.updated" | "audit.updated"; data: { type: string; data?: unknown } };

export type InboxRule = {
  id: string;
  name: string;
  senderContains: string | null;
  subjectContains: string | null;
  bodyContains: string | null;
  setPriority: EmailPriority | null;
  setCategory: EmailCategory | null;
  markNeedsReply: boolean | null;
  autoArchive: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReplyTemplate = {
  _id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
  category: string | null;
  sender: string | null;
  intent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncHistoryEntry = {
  id: string;
  userId: string;
  accountIds: string[];
  status: "completed" | "failed";
  labelIds: string[];
  query: string | null;
  requestedCount: number | "all" | null;
  fetchedCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  failureReasons: string[];
  createdAt: string;
  updatedAt: string;
};

export type SyncProgress = {
  userId: string;
  status: "idle" | "running" | "completed" | "failed";
  phase: "fetching" | "processing" | "completed" | "failed";
  fetchedCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  totalEstimated: number;
  percentage: number;
  partialDataAvailable: boolean;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number;
  message: string;
  error: string | null;
};
