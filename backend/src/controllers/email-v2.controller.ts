import crypto from "crypto";
import type { Response } from "express";
import mongoose from "mongoose";
import type { PipelineStage } from "mongoose";
import { z, ZodError } from "zod";

import { replyStyleSchema } from "../agents/reply.agent";
import { emailInputSchema, runEmailAutomation } from "../graph/email.graph";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { EmailModel } from "../models/email.model";
import { GmailAccountModel } from "../models/gmail-account.model";
import { InboxRuleModel } from "../models/inbox-rule.model";
import { SyncHistoryModel } from "../models/sync-history.model";
import { UserModel } from "../models/user.model";
import { handleInboxChat } from "../services/chatbot.service";
import {
  buildCategoryMongoFilter,
  canonicalEmailCategories,
  getEmailCategoryLabel,
  normalizeEmailCategory,
} from "../services/email-classification.service";
import {
  createOrUpdateEmailRecord,
} from "../services/email-record.service";
import { modifyMessageLabels, trashMessageFromGmail } from "../services/gmail.service";
import { syncInboxToDatabase } from "../services/inbox-sync.service";
import { recordAuditEvent } from "../services/audit.service";
import { sendEmailReplyByNumericId } from "../services/reply-scheduler.service";
import { createNotification } from "../services/notification.service";
import { semanticSearchEmails } from "../services/semantic-search.service";
import {
  completeSyncProgress,
  failSyncProgress,
  getSyncProgress,
  addSyncEstimatedTotal,
  incrementFetchedEmail,
  incrementSyncProcessed,
  startSyncProgress,
  updateSyncFetched,
} from "../services/sync-progress.service";
import { logger } from "../utils/logger";

const requiredGmailReadScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

function hasRequiredReadScopes(scopeValue?: string | null) {
  const scopes = new Set(
    String(scopeValue ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return requiredGmailReadScopes.some((scope) => scopes.has(scope));
}

const includeAllAccountsSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true")
  .optional();

const accountScopeSchema = z.object({
  accountId: z.string().trim().min(1).optional(),
  includeAllAccounts: includeAllAccountsSchema,
});

const fetchEmailsQuerySchema = accountScopeSchema.extend({
  maxResults: z.union([z.coerce.number().int().min(1).max(5000), z.literal("all")]).optional(),
  query: z.string().trim().min(1).optional(),
  labelIds: z.string().trim().optional(),
});

const listEmailsQuerySchema = accountScopeSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sender: z.string().trim().min(1).optional(),
  category: z.enum(canonicalEmailCategories).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  needsReply: z.enum(["true", "false"]).optional(),
  search: z.string().trim().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  groupByThread: includeAllAccountsSchema,
  sortBy: z.enum(["latest", "oldest", "priority", "sender"]).default("latest"),
  status: z.enum(["active", "deleted"]).default("active"),
});

const deleteBySenderQuerySchema = accountScopeSchema.extend({
  email: z.string().trim().email(),
});

const deleteEmailParamsSchema = z.object({
  id: z.coerce.number().int().min(1),
});

const chatSchema = accountScopeSchema.extend({
  message: z.string().trim().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        message: z.string().trim().min(1),
      })
    )
    .max(20)
    .optional(),
});

const semanticSearchSchema = accountScopeSchema.extend({
  query: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const syncHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const inboxRuleBodySchema = z.object({
  name: z.string().trim().min(1),
  senderContains: z.string().trim().min(1).nullable().optional(),
  subjectContains: z.string().trim().min(1).nullable().optional(),
  bodyContains: z.string().trim().min(1).nullable().optional(),
  setPriority: z.enum(["low", "medium", "high"]).nullable().optional(),
  setCategory: z.enum(canonicalEmailCategories).nullable().optional(),
  markNeedsReply: z.boolean().nullable().optional(),
  autoArchive: z.boolean().default(false),
  active: z.boolean().default(true),
});

const inboxRuleParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const composeAttachmentSchema = z.object({
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().min(1).max(24 * 1024 * 1024),
  dataBase64: z.string().trim().min(1),
});

const replyActionBodySchema = z.object({
  reply: z.string().trim().min(1).optional(),
  style: replyStyleSchema.optional(),
  sendAt: z.coerce.date().optional(),
  attachments: z.array(composeAttachmentSchema).max(10).optional(),
});

const bulkActionSchema = accountScopeSchema.extend({
  action: z.enum(["delete", "spam", "read", "unread", "generate-reply"]),
  ids: z.array(z.coerce.number().int().min(1)).min(1),
  style: replyStyleSchema.optional(),
});

function parseLabelIds(labelIds?: string) {
  if (!labelIds) {
    return ["INBOX"];
  }

  return labelIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDefaultFetchMode() {
  const fetchAll = process.env.FETCH_EMAILS_ALL?.toLowerCase() === "true";
  const configuredLimit = Number(process.env.FETCH_EMAILS_LIMIT ?? 25);

  if (fetchAll) {
    return "all" as const;
  }

  if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
    return Math.floor(configuredLimit);
  }

  return 25;
}

async function resolveScopedAccountId(
  userId: string,
  accountId?: string,
  includeAllAccounts = false
) {
  if (includeAllAccounts) {
    return null;
  }

  if (accountId) {
    const scopedAccount = await GmailAccountModel.findOne({
      _id: accountId,
      userId,
      status: "active",
    })
      .select({ _id: 1, scope: 1 })
      .lean();

    return scopedAccount && hasRequiredReadScopes(scopedAccount.scope)
      ? String(scopedAccount._id)
      : null;
  }

  const user = await UserModel.findById(userId).select({ primaryAccountId: 1 }).lean();
  if (!user?.primaryAccountId) {
    return null;
  }

  const primaryAccount = await GmailAccountModel.findOne({
    _id: user.primaryAccountId,
    userId,
    status: "active",
  })
    .select({ _id: 1, scope: 1, createdAt: 1 })
    .lean();

  if (primaryAccount && hasRequiredReadScopes(primaryAccount.scope)) {
    return String(primaryAccount._id);
  }

  const fallbackAccount = await GmailAccountModel.findOne({
    userId,
    status: "active",
  })
    .sort({ isPrimary: -1, createdAt: 1 })
    .select({ _id: 1, scope: 1 })
    .lean();

  return fallbackAccount && hasRequiredReadScopes(fallbackAccount.scope)
    ? String(fallbackAccount._id)
    : null;
}

async function listActiveScopedAccountIds(
  userId: string,
  accountId?: string,
  includeAllAccounts = false
) {
  if (includeAllAccounts) {
    const accounts = await GmailAccountModel.find({
      userId,
      status: "active",
    })
      .sort({ isPrimary: -1, createdAt: 1 })
      .select({ _id: 1, scope: 1 })
      .lean();

    return accounts
      .filter((account) => hasRequiredReadScopes(account.scope))
      .map((account) => String(account._id));
  }

  const resolvedAccountId = await resolveScopedAccountId(userId, accountId, false);
  return resolvedAccountId ? [resolvedAccountId] : [];
}

async function buildUserScope(options: {
  userId: string;
  accountId?: string;
  includeAllAccounts?: boolean;
}) {
  const resolvedAccountId = await resolveScopedAccountId(
    options.userId,
    options.accountId,
    options.includeAllAccounts ?? false
  );

  return {
    resolvedAccountId,
    mongoScope: {
      userId: new mongoose.Types.ObjectId(options.userId),
      ...(resolvedAccountId
        ? { accountId: new mongoose.Types.ObjectId(resolvedAccountId) }
        : {}),
    },
  };
}

async function buildScopedMongoQuery(options: {
  userId: string;
  accountId?: string;
  includeAllAccounts?: boolean;
  extra?: Record<string, unknown>;
}) {
  const { mongoScope, resolvedAccountId } = await buildUserScope({
    userId: options.userId,
    accountId: options.accountId,
    includeAllAccounts: options.includeAllAccounts,
  });

  return {
    resolvedAccountId,
    mongoQuery: {
      ...mongoScope,
      ...(options.extra ?? {}),
    },
  };
}

function toResponseEmail(email: Record<string, unknown>, index = 0, offset = 0) {
  const numericId =
    typeof email.numericId === "number" ? email.numericId : offset + index + 1;

  return {
    ...email,
    category: normalizeEmailCategory(email.category),
    automationActions: Array.isArray(email.automationActions) ? email.automationActions : [],
    attachments: Array.isArray(email.attachments) ? email.attachments : [],
    followUpPending:
      Boolean(email.needsReply) &&
      email.replyStatus !== "sent" &&
      email.status !== "deleted",
    userId: email.userId ? String(email.userId) : null,
    accountId: email.accountId ? String(email.accountId) : null,
    isRead: Boolean(email.isRead),
    isSpam: Boolean(email.isSpam),
    replyDueAt: email.replyDueAt ?? null,
    replyRiskStatus: typeof email.replyRiskStatus === "string" ? email.replyRiskStatus : "none",
    threadMessageCount: typeof email.threadMessageCount === "number" ? email.threadMessageCount : undefined,
    threadParticipants: Array.isArray(email.threadParticipants) ? email.threadParticipants : undefined,
    id: numericId,
    numericId,
  };
}

function buildSort(sortBy: "latest" | "oldest" | "priority" | "sender") {
  if (sortBy === "oldest") {
    return [["originalDate", 1], ["updatedAt", 1]] as [string, 1 | -1][];
  }

  if (sortBy === "priority") {
    return [["priority", 1], ["originalDate", -1], ["updatedAt", -1]] as [string, 1 | -1][];
  }

  if (sortBy === "sender") {
    return [["sender", 1], ["originalDate", -1], ["updatedAt", -1]] as [string, 1 | -1][];
  }

  return [["originalDate", -1], ["updatedAt", -1]] as [string, 1 | -1][];
}

async function notifyInboxSyncComplete(input: {
  userId: string;
  fetchedCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
}) {
  const visibleProcessedCount = input.processedCount + input.skippedCount;
  const totalReviewedCount = visibleProcessedCount + input.failedCount;

  await createNotification({
    userId: input.userId,
    type: input.failedCount > 0 ? "warning" : "success",
    title: input.failedCount > 0 ? "Inbox sync finished with issues" : "Inbox sync complete",
    message:
      input.failedCount > 0
        ? `${visibleProcessedCount} of ${totalReviewedCount} emails were ready. ${input.failedCount} could not be processed.`
        : `${visibleProcessedCount} emails are ready in your inbox workspace.`,
    metadata: {
      kind: "inbox-sync-complete",
      fetchedCount: input.fetchedCount,
      processedCount: input.processedCount,
      skippedCount: input.skippedCount,
      failedCount: input.failedCount,
    },
  });
}

async function recordSyncHistory(input: {
  userId: string;
  accountIds: string[];
  status: "completed" | "failed";
  labelIds: string[];
  query?: string;
  requestedCount?: number | "all";
  fetchedCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  failureReasons?: string[];
}) {
  await SyncHistoryModel.create({
    userId: input.userId,
    accountIds: input.accountIds.map((id) => new mongoose.Types.ObjectId(id)),
    status: input.status,
    labelIds: input.labelIds,
    query: input.query ?? null,
    requestedCount: input.requestedCount ?? null,
    fetchedCount: input.fetchedCount,
    processedCount: input.processedCount,
    skippedCount: input.skippedCount,
    failedCount: input.failedCount,
    durationMs: input.durationMs,
    failureReasons: input.failureReasons ?? [],
  });
}

export async function processEmail(req: AuthenticatedRequest, res: Response) {
  try {
    const payload = emailInputSchema.parse(req.body);
    const result = await runEmailAutomation(payload);
    let savedEmail = null;
    let duplicate = false;

    if (mongoose.connection.readyState === 1 && req.auth?.userId) {
      const generatedMessageId = `manual-${crypto
        .createHash("sha1")
        .update(`${payload.subject}:${payload.body}`)
        .digest("hex")}`;

      const persisted = await createOrUpdateEmailRecord({
        userId: req.auth.userId,
        sender: payload.from,
        subject: payload.subject,
        content: payload.body,
        htmlContent: null,
        category: result.category,
        priority: result.priority,
        reply: result.needsReply
          ? result.reply ??
            "Thanks for your email. We received your message and will get back to you shortly."
          : null,
        replyTone: "professional",
        needsReply: result.needsReply,
        summary: result.summary,
        automationActions: result.automationActions,
        messageId: generatedMessageId,
        originalDate: new Date(),
        gmailThreadId: null,
        isRead: true,
        isSpam: false,
      });

      savedEmail = toResponseEmail(persisted.email.toObject());
      duplicate = persisted.duplicate;
    }

    res.status(200).json({
      success: true,
      data: result,
      duplicate,
      savedEmail,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid email payload",
        details: error.flatten(),
      });
      return;
    }

    logger.error("Manual processEmail failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown email processing error",
    });
  }
}

export async function fetchEmails(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before fetching Gmail messages",
      });
      return;
    }

    const userId = req.auth.userId;
    startSyncProgress(userId, "Fetching inbox emails");
    const query = fetchEmailsQuerySchema.parse(req.query);
    const requestedMaxResults = query.maxResults ?? getDefaultFetchMode();
    const scopedAccountIds = await listActiveScopedAccountIds(
      userId,
      query.accountId,
      query.includeAllAccounts ?? false
    );

    if (scopedAccountIds.length === 0) {
      res.status(400).json({
        success: false,
        error: "Connect a Gmail account before syncing inbox emails",
      });
      return;
    }

    const syncResults = await Promise.allSettled(
      scopedAccountIds.map((scopedAccountId) =>
        syncInboxToDatabase({
          userId,
          accountId: scopedAccountId,
          maxResults: requestedMaxResults === "all" ? undefined : requestedMaxResults,
          query: query.query,
          labelIds: parseLabelIds(query.labelIds),
          onTotalResolved: ({ totalCount }) => {
            if (totalCount > 0) {
              addSyncEstimatedTotal(userId, totalCount);
            }
          },
          onFetched: ({ fetchedCount, skippedCount }) => {
            if (fetchedCount > 0) {
              for (let index = 0; index < fetchedCount; index += 1) {
                incrementFetchedEmail(userId);
              }
            }
            if (skippedCount > 0) {
              updateSyncFetched(userId, 0, skippedCount);
            }
          },
          onProcessed: ({ failed }) => incrementSyncProcessed(userId, failed),
        })
      )
    );
    const successfulSyncResults = syncResults
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof syncInboxToDatabase>>> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);
    const syncFailures = syncResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : "Unknown account sync failure");
    const processedEmails = successfulSyncResults.flatMap((syncResult) =>
      syncResult.data.map((email) => toResponseEmail(email.toObject()))
    );
    const fetchedCount = successfulSyncResults.reduce((total, syncResult) => total + syncResult.fetchedCount, 0);
    const processedCount = processedEmails.length;
    const skippedCount = successfulSyncResults.reduce((total, syncResult) => total + syncResult.skippedCount, 0);
    const duplicateCount = successfulSyncResults.reduce((total, syncResult) => total + syncResult.duplicateCount, 0);
    const failedCount =
      successfulSyncResults.reduce((total, syncResult) => total + syncResult.failedCount, 0) + syncFailures.length;
    const failedEmails = [
      ...successfulSyncResults.flatMap((syncResult) => syncResult.failedEmails),
      ...syncFailures.map((error, index) => ({
        subject: `Account sync ${index + 1}`,
        error,
      })),
    ];
    const fetchDurationMs = successfulSyncResults.reduce(
      (total, syncResult) => Math.max(total, syncResult.fetchDurationMs),
      0
    );

    if (successfulSyncResults.length === 0) {
      throw new Error(syncFailures[0] ?? "Unknown Gmail fetch error");
    }

    res.status(200).json({
      success: true,
      requestedCount: requestedMaxResults,
      fetchedCount,
      processedCount,
      skippedCount,
      duplicateCount,
      failedCount,
      failedEmails,
      fetchDurationMs,
      savedToDatabaseCount: processedCount,
      data: processedEmails,
    });
    completeSyncProgress(userId, {
      fetchedCount,
      processedCount,
      failedCount,
      skippedCount,
      durationMs: fetchDurationMs,
    });
    await recordSyncHistory({
      userId,
      accountIds: scopedAccountIds,
      status: "completed",
      labelIds: parseLabelIds(query.labelIds),
      query: query.query,
      requestedCount: requestedMaxResults,
      fetchedCount,
      processedCount,
      skippedCount,
      failedCount,
      durationMs: fetchDurationMs,
      failureReasons: failedEmails.map((item) => `${item.subject}: ${item.error}`),
    });
    await recordAuditEvent({
      userId,
      actorUserId: userId,
      kind: failedCount > 0 ? "inbox-sync-completed-with-issues" : "inbox-sync-completed",
      title: failedCount > 0 ? "Inbox sync completed with issues" : "Inbox sync completed",
      status: failedCount > 0 ? "warning" : "success",
      targetType: "sync",
      details: {
        fetchedCount,
        processedCount,
        skippedCount,
        failedCount,
        durationMs: fetchDurationMs,
      },
    });
    await notifyInboxSyncComplete({
      userId,
      fetchedCount,
      processedCount,
      skippedCount,
      failedCount,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid fetch request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("fetchEmails failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (req.auth?.userId) {
      failSyncProgress(req.auth.userId, error instanceof Error ? error.message : "Unknown Gmail fetch error");
      const scopedAccountIds = await listActiveScopedAccountIds(
        req.auth.userId,
        typeof req.query.accountId === "string" ? req.query.accountId : undefined,
        req.query.includeAllAccounts === "true"
      ).catch(() => []);
      await recordSyncHistory({
        userId: req.auth.userId,
        accountIds: scopedAccountIds,
        status: "failed",
        labelIds: parseLabelIds(typeof req.query.labelIds === "string" ? req.query.labelIds : undefined),
        query: typeof req.query.query === "string" ? req.query.query : undefined,
        requestedCount:
          typeof req.query.maxResults === "string" && req.query.maxResults !== "all"
            ? Number(req.query.maxResults)
            : req.query.maxResults === "all"
              ? "all"
              : undefined,
        fetchedCount: 0,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        durationMs: 0,
        failureReasons: [error instanceof Error ? error.message : "Unknown Gmail fetch error"],
      });
      await recordAuditEvent({
        userId: req.auth.userId,
        actorUserId: req.auth.userId,
        kind: "inbox-sync-failed",
        title: "Inbox sync failed",
        status: "error",
        targetType: "sync",
        details: {
          error: error instanceof Error ? error.message : "Unknown Gmail fetch error",
        },
      });
      await createNotification({
        userId: req.auth.userId,
        type: "error",
        title: "Inbox sync failed",
        message: error instanceof Error ? error.message : "MailPilot could not complete the inbox sync.",
        metadata: {
          kind: "inbox-sync-failed",
        },
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown Gmail fetch error",
    });
  }
}

export async function getFetchSyncProgress(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: getSyncProgress(req.auth.userId),
  });
}

export async function listSyncHistory(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before reading sync history",
      });
      return;
    }

    const query = syncHistoryQuerySchema.parse(req.query);
    const history = await SyncHistoryModel.find({
      userId: req.auth.userId,
    })
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .lean();

    res.status(200).json({
      success: true,
      data: history.map((entry) => ({
        id: String(entry._id),
        userId: String(entry.userId),
        accountIds: Array.isArray(entry.accountIds) ? entry.accountIds.map((id: unknown) => String(id)) : [],
        status: entry.status,
        labelIds: entry.labelIds ?? [],
        query: entry.query ?? null,
        requestedCount: entry.requestedCount ?? null,
        fetchedCount: entry.fetchedCount ?? 0,
        processedCount: entry.processedCount ?? 0,
        skippedCount: entry.skippedCount ?? 0,
        failedCount: entry.failedCount ?? 0,
        durationMs: entry.durationMs ?? 0,
        failureReasons: entry.failureReasons ?? [],
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid sync history request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("listSyncHistory failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown sync history error",
    });
  }
}

export async function listInboxRules(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const rules = await InboxRuleModel.find({ userId: req.auth.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: rules.map((rule) => ({
        id: String(rule._id),
        name: rule.name,
        senderContains: rule.senderContains ?? null,
        subjectContains: rule.subjectContains ?? null,
        bodyContains: rule.bodyContains ?? null,
        setPriority: rule.setPriority ?? null,
        setCategory: rule.setCategory ?? null,
        markNeedsReply: typeof rule.markNeedsReply === "boolean" ? rule.markNeedsReply : null,
        autoArchive: Boolean(rule.autoArchive),
        active: Boolean(rule.active),
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to load inbox rules",
    });
  }
}

export async function createInboxRule(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const payload = inboxRuleBodySchema.parse(req.body ?? {});
    const rule = await InboxRuleModel.create({
      userId: req.auth.userId,
      ...payload,
    });

    res.status(201).json({
      success: true,
      data: {
        id: String(rule._id),
        ...payload,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid inbox rule", details: error.flatten() });
      return;
    }
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to create inbox rule" });
  }
}

export async function updateInboxRule(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }
    const params = inboxRuleParamsSchema.parse(req.params);
    const payload = inboxRuleBodySchema.parse(req.body ?? {});
    const rule = await InboxRuleModel.findOneAndUpdate(
      { _id: params.id, userId: req.auth.userId },
      { $set: payload },
      { new: true }
    ).lean();

    if (!rule) {
      res.status(404).json({ success: false, error: "Inbox rule not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: String(rule._id),
        name: rule.name,
        senderContains: rule.senderContains ?? null,
        subjectContains: rule.subjectContains ?? null,
        bodyContains: rule.bodyContains ?? null,
        setPriority: rule.setPriority ?? null,
        setCategory: rule.setCategory ?? null,
        markNeedsReply: typeof rule.markNeedsReply === "boolean" ? rule.markNeedsReply : null,
        autoArchive: Boolean(rule.autoArchive),
        active: Boolean(rule.active),
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid inbox rule update", details: error.flatten() });
      return;
    }
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to update inbox rule" });
  }
}

export async function deleteInboxRule(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }
    const params = inboxRuleParamsSchema.parse(req.params);
    const rule = await InboxRuleModel.findOneAndDelete({
      _id: params.id,
      userId: req.auth.userId,
    }).lean();

    if (!rule) {
      res.status(404).json({ success: false, error: "Inbox rule not found" });
      return;
    }

    res.status(200).json({ success: true, data: { id: String(rule._id) } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid inbox rule delete request", details: error.flatten() });
      return;
    }
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete inbox rule" });
  }
}

export async function listProcessedEmails(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before listing processed emails",
      });
      return;
    }

    const query = listEmailsQuerySchema.parse(req.query);
    const { mongoScope } = await buildUserScope({
      userId: req.auth.userId,
      accountId: query.accountId,
      includeAllAccounts: query.includeAllAccounts,
    });
    const mongoQuery: Record<string, unknown> = {
      ...mongoScope,
      status: query.status,
    };

    if (query.sender) {
      mongoQuery.sender = query.sender.toLowerCase();
    }

    if (query.category) {
      mongoQuery.category = buildCategoryMongoFilter(query.category);
    }

    if (query.priority) {
      mongoQuery.priority = query.priority;
    }

    if (query.needsReply) {
      mongoQuery.needsReply = query.needsReply === "true";
      if (query.needsReply === "true") {
        mongoQuery.replyStatus = { $ne: "sent" };
      }
    }

    if (query.search) {
      mongoQuery.$or = [
        { subject: { $regex: query.search, $options: "i" } },
        { content: { $regex: query.search, $options: "i" } },
        { summary: { $regex: query.search, $options: "i" } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      mongoQuery.originalDate = {
        ...(query.dateFrom ? { $gte: query.dateFrom } : {}),
        ...(query.dateTo ? { $lte: query.dateTo } : {}),
      };
    }

    const senderFilterQuery: Record<string, unknown> = {
      ...mongoQuery,
    };
    delete senderFilterQuery.sender;
    const uniqueSendersPromise = EmailModel.distinct("sender", senderFilterQuery);

    let total = 0;
    let emails: Array<Record<string, unknown>> = [];

    const uniqueSenders = await (async () => {
      if (query.groupByThread) {
        const groupPipeline: PipelineStage[] = [
          { $match: mongoQuery },
          {
            $sort: {
              originalDate: -1 as const,
              updatedAt: -1 as const,
            },
          },
          {
            $group: {
              _id: { $ifNull: ["$gmailThreadId", "$messageId"] },
              latestEmail: { $first: "$$ROOT" },
              threadMessageCount: { $sum: 1 },
              participants: { $addToSet: "$sender" },
              maxPriorityRank: {
                $max: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$priority", "high"] }, then: 3 },
                      { case: { $eq: ["$priority", "medium"] }, then: 2 },
                    ],
                    default: 1,
                  },
                },
              },
              needsReplyInThread: { $max: { $cond: [{ $eq: ["$needsReply", true] }, 1, 0] } },
              replyRiskStatus: { $first: "$replyRiskStatus" },
            },
          },
        ];
        const [grouped, senders] = await Promise.all([
          EmailModel.aggregate(groupPipeline),
          uniqueSendersPromise,
        ]);
        const sortedGroups = grouped.sort((left, right) => {
          if (query.sortBy === "sender") {
            return String(left.latestEmail?.sender ?? "").localeCompare(String(right.latestEmail?.sender ?? ""));
          }
          if (query.sortBy === "oldest") {
            return new Date(left.latestEmail?.originalDate ?? left.latestEmail?.updatedAt ?? 0).getTime() -
              new Date(right.latestEmail?.originalDate ?? right.latestEmail?.updatedAt ?? 0).getTime();
          }
          if (query.sortBy === "priority") {
            return (right.maxPriorityRank ?? 0) - (left.maxPriorityRank ?? 0);
          }
          return new Date(right.latestEmail?.originalDate ?? right.latestEmail?.updatedAt ?? 0).getTime() -
            new Date(left.latestEmail?.originalDate ?? left.latestEmail?.updatedAt ?? 0).getTime();
        });

        total = sortedGroups.length;
        emails = sortedGroups.slice((query.page - 1) * query.limit, query.page * query.limit).map((item) => ({
          ...item.latestEmail,
          priority: item.maxPriorityRank === 3 ? "high" : item.maxPriorityRank === 2 ? "medium" : "low",
          needsReply: Boolean(item.needsReplyInThread),
          threadMessageCount: item.threadMessageCount,
          threadParticipants: item.participants,
          replyRiskStatus: item.replyRiskStatus ?? item.latestEmail?.replyRiskStatus ?? "none",
          summary:
            item.threadMessageCount > 1
              ? `${item.threadMessageCount} messages in this conversation`
              : item.latestEmail?.summary,
        }));
        return senders;
      }

      const [countResult, listResult, senders] = await Promise.all([
        EmailModel.countDocuments(mongoQuery),
        EmailModel.find(mongoQuery)
          .sort(buildSort(query.sortBy))
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean(),
        uniqueSendersPromise,
      ]);

      total = countResult;
      emails = listResult;
      return senders;
    })();

    res.status(200).json({
      success: true,
      count: emails.length,
      total,
      page: query.page,
      limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        senders: uniqueSenders.sort(),
        data: emails.map((email, index) =>
        toResponseEmail(email, index, (query.page - 1) * query.limit)
      ),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid list request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("listProcessedEmails failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown email listing error",
    });
  }
}

export async function semanticSearch(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before searching emails",
      });
      return;
    }

    const payload = semanticSearchSchema.parse(req.body ?? {});
    const emails = await semanticSearchEmails(payload.query, payload.limit);
    const { mongoScope } = await buildUserScope({
      userId: req.auth.userId,
      accountId: payload.accountId,
      includeAllAccounts: payload.includeAllAccounts,
    });
    const scopedIds = new Set(
      (
        await EmailModel.find({
          ...mongoScope,
          _id: { $in: emails.map((email) => email._id) },
        })
          .select({ _id: 1 })
          .lean()
      ).map((email) => String(email._id))
    );

    res.status(200).json({
      success: true,
      total: emails.filter((email) => scopedIds.has(String(email._id))).length,
      page: 1,
      limit: payload.limit,
      totalPages: 1,
      senders: [],
      data: emails
        .filter((email) => scopedIds.has(String(email._id)))
        .map((email, index) => toResponseEmail(email, index)),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid semantic search request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("semanticSearch failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown semantic search error",
    });
  }
}

export async function getPendingFollowUps(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before reading follow-ups",
      });
      return;
    }

    const scope = accountScopeSchema.parse(req.query);
    const { mongoQuery } = await buildScopedMongoQuery({
      userId: req.auth.userId,
      accountId: scope.accountId,
      includeAllAccounts: scope.includeAllAccounts,
      extra: {
      status: "active",
      needsReply: true,
      replyStatus: { $ne: "sent" },
      },
    });
      const emails = await EmailModel.find(mongoQuery)
        .sort({ replyDueAt: 1, priority: -1, originalDate: -1, updatedAt: -1 })
        .limit(12)
        .lean();
      const overdueCount = emails.filter((email) => email.replyRiskStatus === "overdue").length;
      const atRiskCount = emails.filter((email) => email.replyRiskStatus === "at-risk").length;

      res.status(200).json({
        success: true,
        data: {
          count: emails.length,
          overdueCount,
          atRiskCount,
          alert:
            overdueCount > 0
              ? `${overdueCount} conversations are overdue`
              : atRiskCount > 0
                ? `${atRiskCount} conversations are at risk`
                : `You have ${emails.length} pending replies`,
          emails: emails.map((email, index) => toResponseEmail(email, index)),
        },
      });
  } catch (error) {
    logger.error("getPendingFollowUps failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown follow-up error",
    });
  }
}

export async function generatePendingFollowUpReplies(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const payload = accountScopeSchema
      .extend({
        limit: z.coerce.number().int().min(1).max(25).default(10),
        style: replyStyleSchema.default("professional"),
      })
      .parse(req.body ?? {});

    const { mongoQuery } = await buildScopedMongoQuery({
      userId: req.auth.userId,
      accountId: payload.accountId,
      includeAllAccounts: payload.includeAllAccounts,
      extra: {
        status: "active",
        needsReply: true,
        replyStatus: { $in: ["draft", "failed"] },
      },
    });
    const emails = await EmailModel.find(mongoQuery)
      .sort({ priority: -1, originalDate: -1, updatedAt: -1 })
      .limit(payload.limit);

    const updated = [];
    for (const email of emails) {
      const result = await sendEmailReplyByNumericId(email.numericId, {
        style: payload.style,
        draftOnly: true,
      });
      updated.push(toResponseEmail(result.email.toObject()));
    }

    res.status(200).json({
      success: true,
      data: {
        generatedCount: updated.length,
        emails: updated,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid follow-up generation request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("generatePendingFollowUpReplies failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown follow-up generation error",
    });
  }
}

export async function deleteEmailsBySender(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before deleting emails",
      });
      return;
    }

    const query = deleteBySenderQuerySchema.parse(req.query);
    const sender = query.email.toLowerCase();
    const { mongoQuery } = await buildScopedMongoQuery({
      userId: req.auth.userId,
      accountId: query.accountId,
      includeAllAccounts: query.includeAllAccounts,
      extra: {
        sender,
        status: "active",
      },
    });
    const emails = await EmailModel.find(mongoQuery);

    for (const email of emails) {
      email.status = "deleted";
      email.processedAt = new Date();
      await email.save();

      if (email.messageId) {
        await trashMessageFromGmail(email.messageId, email.accountId ? String(email.accountId) : null);
      }
    }

    res.status(200).json({
      success: true,
      deletedCount: emails.length,
      sender,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid delete request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("deleteEmailsBySender failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown sender delete error",
    });
  }
}

export async function deleteEmail(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const params = deleteEmailParamsSchema.parse(req.params);
    const email = await EmailModel.findOne({
      userId: req.auth.userId,
      numericId: params.id,
      status: "active",
    });

    if (!email) {
      res.status(404).json({
        success: false,
        error: "Email not found",
      });
      return;
    }

    email.status = "deleted";
    email.processedAt = new Date();
    await email.save();

    if (email.messageId) {
      await trashMessageFromGmail(email.messageId, email.accountId ? String(email.accountId) : null);
    }

    res.status(200).json({
      success: true,
      data: toResponseEmail(email.toObject()),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid delete request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("deleteEmail failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown delete error",
    });
  }
}

export async function generateReplyDraft(req: AuthenticatedRequest, res: Response) {
  try {
    const params = deleteEmailParamsSchema.parse(req.params);
    const body = z
      .object({
        style: replyStyleSchema.default("professional"),
      })
      .parse(req.body ?? {});

    const result = await sendEmailReplyByNumericId(params.id, {
      style: body.style,
      draftOnly: true,
    });

    res.status(200).json({
      success: true,
      data: toResponseEmail(result.email.toObject()),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid reply generation request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("generateReplyDraft failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown reply generation error",
    });
  }
}

export async function sendReplyNow(req: AuthenticatedRequest, res: Response) {
  try {
    const params = deleteEmailParamsSchema.parse(req.params);
    const body = replyActionBodySchema.parse(req.body ?? {});
    const result = await sendEmailReplyByNumericId(params.id, {
      reply: body.reply,
      style: body.style,
      scheduledAt: null,
      attachments: body.attachments,
    });

    res.status(200).json({
      success: true,
      data: toResponseEmail(result.email.toObject()),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid reply request",
        details: error.flatten(),
      });
      return;
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown reply send error";
    const scopeFailure =
      /send-capable scope|insufficient authentication scopes/i.test(errorMessage);

    if (scopeFailure) {
      const email = await EmailModel.findOne({ numericId: Number(req.params.id) }).lean();
      res.status(403).json({
        success: false,
        error:
          `${errorMessage} The reply draft was saved, but Gmail cannot send it until the refresh token is recreated with the required scope.`,
        data: email ? toResponseEmail(email) : undefined,
      });
      return;
    }

    logger.error("sendReplyNow failed", {
      error: errorMessage,
    });
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

export async function scheduleReply(req: AuthenticatedRequest, res: Response) {
  try {
    const params = deleteEmailParamsSchema.parse(req.params);
    const body = replyActionBodySchema.extend({
      sendAt: z.coerce.date(),
    }).parse(req.body ?? {});

    if (body.sendAt.getTime() <= Date.now()) {
      res.status(400).json({
        success: false,
        error: "Scheduled send time must be in the future",
      });
      return;
    }

    const result = await sendEmailReplyByNumericId(params.id, {
      reply: body.reply,
      style: body.style,
      scheduledAt: body.sendAt,
      attachments: body.attachments,
    });

    res.status(200).json({
      success: true,
      data: toResponseEmail(result.email.toObject()),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid schedule request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("scheduleReply failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown reply schedule error",
    });
  }
}

export async function getEmailStats(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before reading stats",
      });
      return;
    }

    const scope = accountScopeSchema.parse(req.query);
    const { mongoScope } = await buildUserScope({
      userId: req.auth.userId,
      accountId: scope.accountId,
      includeAllAccounts: scope.includeAllAccounts,
    });

    const [totalEmails, processedEmails, remainingEmails, oldestProcessed, newestProcessed] =
      await Promise.all([
        EmailModel.countDocuments({ ...mongoScope, status: "active" }),
        EmailModel.countDocuments({ ...mongoScope, status: "active", processedAt: { $exists: true } }),
        EmailModel.countDocuments({
          ...mongoScope,
          status: "active",
          needsReply: true,
          replyStatus: { $ne: "sent" },
        }),
        EmailModel.findOne({ ...mongoScope, status: "active", processedAt: { $exists: true } })
          .sort({ processedAt: 1 })
          .select({ processedAt: 1 })
          .lean(),
        EmailModel.findOne({ ...mongoScope, status: "active", processedAt: { $exists: true } })
          .sort({ processedAt: -1 })
          .select({ processedAt: 1 })
          .lean(),
      ]);

    const durationMs =
      oldestProcessed?.processedAt && newestProcessed?.processedAt
        ? new Date(newestProcessed.processedAt).getTime() -
          new Date(oldestProcessed.processedAt).getTime()
        : 0;

    res.status(200).json({
      success: true,
      data: {
        totalEmails,
        processedEmails,
        remainingEmails,
        processingDurationMs: durationMs,
      },
    });
  } catch (error) {
    logger.error("getEmailStats failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown stats error",
    });
  }
}

export async function getEmailAnalytics(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before reading analytics",
      });
      return;
    }

    const scope = accountScopeSchema.parse(req.query);
    const { mongoScope } = await buildUserScope({
      userId: req.auth.userId,
      accountId: scope.accountId,
      includeAllAccounts: scope.includeAllAccounts,
    });
    const emails = await EmailModel.find({ ...mongoScope, status: "active" })
      .select({
        sender: 1,
        subject: 1,
        content: 1,
        category: 1,
        priority: 1,
        reply: 1,
        originalDate: 1,
        createdAt: 1,
      })
      .lean();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const categoryDistribution = new Map<string, number>();
    const priorityBreakdown = new Map<"high" | "medium" | "low", number>();
    const senderCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    let dailyTotal = 0;
    let weeklyTotal = 0;
    let monthlyTotal = 0;
    let repliedCount = 0;

    for (const email of emails) {
      const receivedAt = new Date(
        email.originalDate ?? email.createdAt ?? Date.now()
      ).getTime();

      if (receivedAt >= oneDayAgo) {
        dailyTotal += 1;
      }
      if (receivedAt >= oneWeekAgo) {
        weeklyTotal += 1;
      }
      if (receivedAt >= oneMonthAgo) {
        monthlyTotal += 1;
      }

      const analyticsCategory = getEmailCategoryLabel(email.category);
      categoryDistribution.set(
        analyticsCategory,
        (categoryDistribution.get(analyticsCategory) ?? 0) + 1
      );

      const priority = (email.priority ?? "low") as "high" | "medium" | "low";
      priorityBreakdown.set(priority, (priorityBreakdown.get(priority) ?? 0) + 1);

      const sender = (email.sender ?? "").toLowerCase();
      if (sender) {
        senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1);
        const domain = sender.split("@")[1] ?? sender;
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }

      if (email.reply) {
        repliedCount += 1;
      }
    }

    const totalEmails = emails.length;
    const replyRate = totalEmails > 0 ? Math.round((repliedCount / totalEmails) * 100) : 0;

    const sortedSenders = Array.from(senderCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([sender, count]) => ({ sender, count }));

    const sortedDomains = Array.from(domainCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    const categoryItems = Array.from(categoryDistribution.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalEmails > 0 ? Math.round((count / totalEmails) * 100) : 0,
      }));

    const priorityItems = (["high", "medium", "low"] as const).map((priority) => {
      const count = priorityBreakdown.get(priority) ?? 0;
      return {
        priority,
        count,
        percentage: totalEmails > 0 ? Math.round((count / totalEmails) * 100) : 0,
      };
    });

    const lowPriority = priorityItems.find((item) => item.priority === "low");
    const topSender = sortedSenders[0];
    const topDomain = sortedDomains[0];
    const senderInsights = Array.from(senderCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([sender, count]) => {
        const senderEmails = emails.filter((email) => (email.sender ?? "").toLowerCase() === sender);
        const replyableCount = senderEmails.filter((email) => email.reply).length;
        const responseRate = count > 0 ? Math.round((replyableCount / count) * 100) : 0;
        const topCategoryMap = new Map<string, number>();
        for (const email of senderEmails) {
          const category = getEmailCategoryLabel(email.category);
          topCategoryMap.set(category, (topCategoryMap.get(category) ?? 0) + 1);
        }
        const dominantCategory =
          Array.from(topCategoryMap.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Other";
        const autoRules: string[] = [];
        if (count >= 5) {
          autoRules.push("Create a sender rule for priority routing");
        }
        if (dominantCategory.toLowerCase() === "promotions" || dominantCategory.toLowerCase() === "updates") {
          autoRules.push("Auto-archive low-priority messages from this sender");
        }
        if (responseRate < 30) {
          autoRules.push("Prepare a reusable reply template");
        }
        if (autoRules.length === 0) {
          autoRules.push("No automation recommended yet");
        }
        return {
          sender,
          count,
          responseRate,
          dominantCategory,
          autoRules,
        };
      });
    const insights = [
      lowPriority
        ? `${lowPriority.percentage}% emails are low priority`
        : "No priority insight available",
      topSender
        ? `Most emails come from ${topSender.sender}`
        : "No sender insight available",
      topDomain
        ? `Top email domain is ${topDomain.domain}`
        : "No domain insight available",
      replyRate > 0
        ? `Reply coverage is ${replyRate}% of active emails`
        : "No replied emails recorded yet",
    ];

    res.status(200).json({
      success: true,
      data: {
        totals: {
          daily: dailyTotal,
          weekly: weeklyTotal,
          monthly: monthlyTotal,
          overall: totalEmails,
        },
        replyRate,
        categoryDistribution: categoryItems,
        topSenders: sortedSenders,
        topDomains: sortedDomains,
        senderInsights,
        priorityBreakdown: priorityItems,
        insights,
      },
    });
  } catch (error) {
    logger.error("getEmailAnalytics failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown analytics error",
    });
  }
}

export async function chatWithInbox(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const payload = chatSchema.parse(req.body);
    const resolvedAccountId = await resolveScopedAccountId(
      req.auth.userId,
      payload.accountId,
      payload.includeAllAccounts ?? false
    );
    const response = await handleInboxChat(payload.message, {
      userId: req.auth.userId,
      accountId: resolvedAccountId,
      includeAllAccounts: payload.includeAllAccounts ?? false,
      history: payload.history,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid chat request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("chatWithInbox failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown chatbot error",
    });
  }
}

export async function bulkEmailAction(req: AuthenticatedRequest, res: Response) {
  try {
    if (mongoose.connection.readyState !== 1 || !req.auth?.userId) {
      res.status(503).json({
        success: false,
        error: "MongoDB connection is required before bulk actions",
      });
      return;
    }

    const payload = bulkActionSchema.parse(req.body ?? {});
    const { mongoQuery } = await buildScopedMongoQuery({
      userId: req.auth.userId,
      accountId: payload.accountId,
      includeAllAccounts: payload.includeAllAccounts,
      extra: {
        numericId: { $in: payload.ids },
        status: "active",
      },
    });
    const emails = await EmailModel.find(mongoQuery);

    if (emails.length === 0) {
      res.status(404).json({
        success: false,
        error: "No matching emails found for the selected bulk action",
      });
      return;
    }

    const updatedEmails = [];

    for (const email of emails) {
      if (payload.action === "delete") {
        email.status = "deleted";
        email.processedAt = new Date();
        await email.save();
        if (email.messageId) {
          await trashMessageFromGmail(email.messageId, email.accountId ? String(email.accountId) : null);
        }
      } else if (payload.action === "spam") {
        email.category = "spam";
        email.isSpam = true;
        email.processedAt = new Date();
        await email.save();
        if (email.messageId) {
          await modifyMessageLabels({
            messageId: email.messageId,
            accountId: email.accountId ? String(email.accountId) : null,
            addLabelIds: ["SPAM"],
            removeLabelIds: ["INBOX"],
          });
        }
      } else if (payload.action === "read" || payload.action === "unread") {
        const shouldMarkRead = payload.action === "read";
        email.isRead = shouldMarkRead;
        email.processedAt = new Date();
        await email.save();
        if (email.messageId) {
          await modifyMessageLabels({
            messageId: email.messageId,
            accountId: email.accountId ? String(email.accountId) : null,
            addLabelIds: shouldMarkRead ? [] : ["UNREAD"],
            removeLabelIds: shouldMarkRead ? ["UNREAD"] : [],
          });
        }
      } else if (payload.action === "generate-reply") {
        const result = await sendEmailReplyByNumericId(email.numericId, {
          style: payload.style,
          draftOnly: true,
        });
        updatedEmails.push(toResponseEmail(result.email.toObject()));
        continue;
      }

      updatedEmails.push(toResponseEmail(email.toObject()));
    }

    res.status(200).json({
      success: true,
      data: {
        action: payload.action,
        count: updatedEmails.length,
        emails: updatedEmails,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid bulk action request",
        details: error.flatten(),
      });
      return;
    }

    logger.error("bulkEmailAction failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown bulk action error",
    });
  }
}
