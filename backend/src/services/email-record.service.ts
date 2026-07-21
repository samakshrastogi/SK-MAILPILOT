import crypto from "crypto";

import { CounterModel } from "../models/counter.model";
import { EmailModel } from "../models/email.model";
import type { ReplyStyle } from "../agents/reply.agent";
import type { EmailAttachmentRecord } from "./attachment-analysis.service";
import type { EmailCategory, EmailPriority } from "./email-classification.service";
import {
  normalizeEmailCategory,
  normalizeEmailPriority,
} from "./email-classification.service";
import { applyInboxRules, buildReplySla } from "./inbox-rule.service";

export type PersistedEmailPayload = {
  userId: string;
  accountId?: string | null;
  sender: string;
  recipients?: string[];
  mailboxType?: "inbox" | "sent";
  subject: string;
  content: string;
  htmlContent?: string | null;
  category: EmailCategory;
  priority: EmailPriority;
  reply: string | null;
  replyTone?: ReplyStyle;
  needsReply: boolean;
  summary: string;
  automationActions?: string[];
  attachments?: EmailAttachmentRecord[];
  messageId: string;
  gmailThreadId?: string | null;
  originalDate?: Date | null;
  isRead?: boolean;
  isSpam?: boolean;
};

export function trimEmailContent(content: string, maxLength = 4000) {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildContentHash(subject: string, content: string) {
  return crypto
    .createHash("sha1")
    .update(`${subject.trim().toLowerCase()}::${content.trim().toLowerCase()}`)
    .digest("hex");
}

async function getNextNumericId() {
  const counter = await CounterModel.findOneAndUpdate(
    { key: "emailNumericId" },
    { $inc: { value: 1 } },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return counter.value;
}

export async function ensureEmailNumericIds() {
  const emailsWithoutNumericId = await EmailModel.find({
    numericId: { $exists: false },
  })
    .sort({ createdAt: 1, _id: 1 })
    .select({ _id: 1 })
    .lean();

  for (const email of emailsWithoutNumericId) {
    const numericId = await getNextNumericId();
    await EmailModel.updateOne(
      { _id: email._id, numericId: { $exists: false } },
      { $set: { numericId } }
    );
  }
}

export async function createOrUpdateEmailRecord(payload: PersistedEmailPayload) {
  const normalizedSender = payload.sender.trim().toLowerCase();
  const normalizedSubject = payload.subject.trim();
  const trimmedContent = trimEmailContent(payload.content);
  const contentHash = buildContentHash(normalizedSubject, trimmedContent);
  const normalizedCategory = normalizeEmailCategory(payload.category);
  const normalizedPriority = normalizeEmailPriority(payload.priority);
  const ruleResult = await applyInboxRules({
    userId: payload.userId,
    sender: normalizedSender,
    subject: normalizedSubject,
    content: trimmedContent,
    category: normalizedCategory,
    priority: normalizedPriority,
    needsReply: payload.needsReply,
    automationActions: payload.automationActions,
  });
  const sla = buildReplySla(ruleResult.priority, ruleResult.needsReply, payload.originalDate ?? null);

  const existingByMessageId = await EmailModel.findOne({
    userId: payload.userId,
    accountId: payload.accountId ?? null,
    messageId: payload.messageId,
  });

  if (existingByMessageId) {
    if (existingByMessageId.status === "deleted") {
      existingByMessageId.status = "active";
    }

    existingByMessageId.sender = normalizedSender;
    existingByMessageId.recipients = payload.recipients ?? [];
    existingByMessageId.mailboxType = payload.mailboxType ?? "inbox";
    existingByMessageId.userId = payload.userId;
    existingByMessageId.accountId = payload.accountId ?? null;
    existingByMessageId.subject = normalizedSubject;
    existingByMessageId.content = trimmedContent;
    existingByMessageId.htmlContent = payload.htmlContent ?? null;
    existingByMessageId.category = normalizedCategory;
    existingByMessageId.category = ruleResult.category;
    existingByMessageId.priority = ruleResult.priority;
    existingByMessageId.reply = payload.reply;
    existingByMessageId.replyTone = payload.replyTone ?? "professional";
    existingByMessageId.needsReply = ruleResult.needsReply;
    existingByMessageId.replyDueAt = sla.replyDueAt;
    existingByMessageId.replyRiskStatus = sla.replyRiskStatus;
    existingByMessageId.summary = payload.summary;
    existingByMessageId.automationActions = ruleResult.automationActions;
    existingByMessageId.attachments = payload.attachments ?? [];
    existingByMessageId.gmailThreadId = payload.gmailThreadId ?? null;
    existingByMessageId.originalDate = payload.originalDate ?? null;
    existingByMessageId.status = ruleResult.archive ? "deleted" : "active";
    existingByMessageId.isRead = payload.isRead ?? existingByMessageId.isRead ?? false;
    existingByMessageId.isSpam = payload.isSpam ?? existingByMessageId.isSpam ?? false;
    existingByMessageId.processedAt = new Date();
    existingByMessageId.contentHash = contentHash;
    await existingByMessageId.save();

    return { email: existingByMessageId, duplicate: false, reason: "updated" as const };
  }

  const duplicate = await EmailModel.findOne({
    userId: payload.userId,
    accountId: payload.accountId ?? null,
    subject: normalizedSubject,
    contentHash,
  });

  if (duplicate) {
    return { email: duplicate, duplicate: true, reason: "subject-content-match" as const };
  }

  const numericId = await getNextNumericId();
  const email = await EmailModel.create({
    userId: payload.userId,
    accountId: payload.accountId ?? null,
    numericId,
    sender: normalizedSender,
      recipients: payload.recipients ?? [],
      mailboxType: payload.mailboxType ?? "inbox",
    subject: normalizedSubject,
    content: trimmedContent,
    htmlContent: payload.htmlContent ?? null,
    category: ruleResult.category,
    priority: ruleResult.priority,
    reply: payload.reply,
    replyTone: payload.replyTone ?? "professional",
    needsReply: ruleResult.needsReply,
    replyDueAt: sla.replyDueAt,
    replyRiskStatus: sla.replyRiskStatus,
    summary: payload.summary,
    automationActions: ruleResult.automationActions,
    attachments: payload.attachments ?? [],
    messageId: payload.messageId,
    gmailThreadId: payload.gmailThreadId ?? null,
    status: ruleResult.archive ? "deleted" : "active",
    isRead: payload.isRead ?? false,
    isSpam: payload.isSpam ?? false,
    originalDate: payload.originalDate ?? null,
    processedAt: new Date(),
    contentHash,
  });

  return { email, duplicate: false, reason: "created" as const };
}
