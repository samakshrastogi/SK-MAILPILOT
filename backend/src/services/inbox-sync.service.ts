import mongoose from "mongoose";

import { runEmailAutomation } from "../graph/email.graph";
import { EmailModel } from "../models/email.model";
import type { EmailAttachmentRecord } from "./attachment-analysis.service";
import { createOrUpdateEmailRecord, trimEmailContent } from "./email-record.service";
import { fetchEmailsFromGmail } from "./gmail.service";
import { getRequiredNumberEnv } from "../config/env";

type SyncOptions = {
  userId?: string;
  accountId?: string | null;
  maxResults?: number;
  query?: string;
  labelIds?: string[];
  onFetched?: (payload: { fetchedCount: number; skippedCount: number }) => void;
  onTotalResolved?: (payload: { totalCount: number }) => void;
  onProcessed?: (payload: { failed: boolean }) => void;
};

const emailSyncConcurrency = Math.max(1, getRequiredNumberEnv("EMAIL_SYNC_CONCURRENCY"));

async function upsertProcessedEmail(email: {
  userId: string;
  accountId?: string | null;
  sender: string;
  subject: string;
  body: string;
  htmlBody?: string | null;
  attachments?: EmailAttachmentRecord[];
  messageId: string;
  originalDate?: Date | null;
  gmailThreadId?: string | null;
  isRead?: boolean;
  isSpam?: boolean;
}) {
  const trimmedBody = trimEmailContent(email.body);
  const workflowResult = await runEmailAutomation({
    subject: email.subject,
    from: email.sender,
    body: trimmedBody,
  });

  return createOrUpdateEmailRecord({
    userId: email.userId,
    accountId: email.accountId ?? null,
    sender: email.sender,
    subject: email.subject,
    content: trimmedBody,
    htmlContent: email.htmlBody ?? null,
    attachments: email.attachments ?? [],
    category: workflowResult.category,
    priority: workflowResult.priority,
    reply: workflowResult.needsReply
      ? workflowResult.reply ??
        "Thanks for your email. We received your message and will get back to you shortly."
      : null,
    replyTone: "professional",
    needsReply: workflowResult.needsReply,
    summary: workflowResult.summary,
    automationActions: workflowResult.automationActions,
    messageId: email.messageId,
    originalDate: email.originalDate ?? null,
    gmailThreadId: email.gmailThreadId ?? null,
    isRead: email.isRead,
    isSpam: email.isSpam,
  });
}

function mapFetchedEmailToPersistedShape(
  userId: string,
  accountId: string | null | undefined,
  email: Awaited<ReturnType<typeof fetchEmailsFromGmail>>[number]
) {
  return {
    sender: email.sender,
    userId,
    accountId: accountId ?? email.accountId,
    subject: email.subject,
    body: email.body,
    htmlBody: email.htmlBody,
    attachments: email.attachments,
    messageId: email.gmailMessageId,
    originalDate: email.originalDate,
    gmailThreadId: email.gmailThreadId,
    isRead: !email.labelIds.includes("UNREAD"),
    isSpam: email.labelIds.includes("SPAM"),
  };
}

export async function syncInboxToDatabase(options: SyncOptions = {}) {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection is required before fetching Gmail messages");
  }

  if (!options.userId) {
    throw new Error("userId is required to sync inbox messages");
  }

  if (!options.accountId) {
    throw new Error("Connect a Gmail account before syncing inbox messages");
  }

  const startedAt = Date.now();

  const userId = options.userId;
  const processedEmails: Awaited<ReturnType<typeof createOrUpdateEmailRecord>>["email"][] = [];
  const failedEmails: Array<{ subject: string; error: string }> = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  const activeTasks = new Set<Promise<void>>();

  const existingMessageIds = new Set(
    (
      await EmailModel.find({
        userId: options.userId,
        accountId: options.accountId ?? null,
        messageId: { $exists: true },
      })
        .select({ messageId: 1, _id: 0 })
        .lean()
    )
      .map((record) => record.messageId)
      .filter((value): value is string => Boolean(value))
  );

  async function scheduleEmailProcessing(email: Awaited<ReturnType<typeof fetchEmailsFromGmail>>[number]) {
    if (existingMessageIds.has(email.gmailMessageId)) {
      skippedCount += 1;
      options.onFetched?.({ fetchedCount: 0, skippedCount: 1 });
      return;
    }

    existingMessageIds.add(email.gmailMessageId);

    let taskPromise: Promise<void> | null = null;
    taskPromise = (async () => {
      try {
        const processedEmail = await upsertProcessedEmail(
          mapFetchedEmailToPersistedShape(userId, options.accountId, email)
        );
        processedEmails.push(processedEmail.email);
        if (processedEmail.duplicate) {
          duplicateCount += 1;
        }
        options.onProcessed?.({ failed: false });
      } catch (error) {
        failedEmails.push({
          subject: email.subject,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        options.onProcessed?.({ failed: true });
      } finally {
        if (taskPromise) {
          activeTasks.delete(taskPromise);
        }
      }
    })();

    activeTasks.add(taskPromise);
    if (activeTasks.size >= emailSyncConcurrency) {
      await Promise.race(activeTasks);
    }
  }

  const emails = await fetchEmailsFromGmail({
    accountId: options.accountId,
    maxResults: options.maxResults,
    query: options.query,
    labelIds: options.labelIds ?? ["INBOX"],
    onMessageFetched: () => options.onFetched?.({ fetchedCount: 1, skippedCount: 0 }),
    onTotalResolved: (totalCount) => options.onTotalResolved?.({ totalCount }),
    onEmailResolved: scheduleEmailProcessing,
  });
  await Promise.all(activeTasks);

  return {
    fetchedCount: emails.length,
    processedCount: processedEmails.length,
    skippedCount,
    duplicateCount,
    failedCount: failedEmails.length,
    failedEmails,
    fetchDurationMs: Date.now() - startedAt,
    data: processedEmails,
  };
}
