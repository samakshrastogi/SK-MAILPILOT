import mongoose from "mongoose";

import { buildContextAwareFallbackReply, generateReply } from "../agents/reply.agent";
import type { ReplyStyle } from "../agents/reply.agent";
import { EmailModel } from "../models/email.model";
import { sendReplyThroughGmail } from "./gmail.service";
import {
  normalizeEmailCategory,
  normalizeEmailPriority,
} from "./email-classification.service";
import { logger } from "../utils/logger";
import type { GmailSendAttachment } from "./gmail.service";
import { getRequiredNumberEnv } from "../config/env";

const replySchedulerPollMs = getRequiredNumberEnv("REPLY_SCHEDULER_POLL_MS");
let schedulerHandle: NodeJS.Timeout | null = null;
let schedulerBusy = false;

async function ensureReplyContent(email: {
  subject: string;
  sender: string;
  content: string;
  category?: string | null;
  priority?: string | null;
  summary?: string | null;
  reply?: string | null;
}, style: ReplyStyle = "professional", forceGenerate = false) {
  if (!forceGenerate && email.reply?.trim()) {
    return email.reply.trim();
  }

  try {
    const generated = await generateReply({
      subject: email.subject,
      from: email.sender,
      body: email.content,
      category: normalizeEmailCategory(email.category),
      priority: normalizeEmailPriority(email.priority),
      summary: email.summary ?? "",
    }, style);

    return (
      generated.reply?.trim() ||
      buildContextAwareFallbackReply(
        {
          subject: email.subject,
          from: email.sender,
          body: email.content,
          category: normalizeEmailCategory(email.category),
          priority: normalizeEmailPriority(email.priority),
          summary: email.summary ?? "",
        },
        style
      )
    );
  } catch {
    return buildContextAwareFallbackReply(
      {
        subject: email.subject,
        from: email.sender,
        body: email.content,
        category: normalizeEmailCategory(email.category),
        priority: normalizeEmailPriority(email.priority),
        summary: email.summary ?? "",
      },
      style
    );
  }
}

export async function sendEmailReplyByNumericId(
  numericId: number,
  options?: {
    reply?: string;
    style?: ReplyStyle;
    scheduledAt?: Date | null;
    draftOnly?: boolean;
    attachments?: GmailSendAttachment[];
  }
) {
  const email = await EmailModel.findOne({ numericId, status: "active" });

  if (!email) {
    throw new Error("Email not found");
  }

  const replyBody =
    options?.reply?.trim() ||
    (await ensureReplyContent(
      email.toObject(),
      options?.style,
      options?.draftOnly || Boolean(options?.style && options.style !== email.replyTone)
    ));

  email.reply = replyBody;
  email.replyTone = options?.style ?? email.replyTone ?? "professional";

  if (options?.draftOnly) {
    email.replyStatus = "draft";
    email.replyError = null;
    await email.save();

    return {
      status: "draft" as const,
      email,
    };
  }

  if (options?.scheduledAt) {
    email.replyStatus = "scheduled";
    email.scheduledReplyAt = options.scheduledAt;
    email.replyError = null;
    await email.save();

    return {
      status: "scheduled" as const,
      email,
    };
  }

  try {
    await sendReplyThroughGmail({
      to: email.sender,
      subject: email.subject,
      body: replyBody,
      accountId: email.accountId ? String(email.accountId) : null,
      threadId: email.gmailThreadId,
      attachments: options?.attachments ?? [],
    });

    email.replyStatus = "sent";
    email.replySentAt = new Date();
    email.scheduledReplyAt = null;
    email.replyError = null;
    email.processedAt = new Date();
    await email.save();

    return {
      status: "sent" as const,
      email,
    };
  } catch (error) {
    email.replyStatus = "failed";
    email.replyError = error instanceof Error ? error.message : "Failed to send reply";
    await email.save();
    throw error;
  }
}

export async function processScheduledReplies() {
  if (schedulerBusy || mongoose.connection.readyState !== 1) {
    return;
  }

  schedulerBusy = true;

  try {
    const dueEmails = await EmailModel.find({
      status: "active",
      replyStatus: "scheduled",
      scheduledReplyAt: { $lte: new Date() },
    })
      .sort({ scheduledReplyAt: 1 })
      .limit(20);

    for (const email of dueEmails) {
      try {
        await sendEmailReplyByNumericId(email.numericId);
      } catch (error) {
        logger.warn("Scheduled reply send failed", {
          numericId: email.numericId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } finally {
    schedulerBusy = false;
  }
}

export function startReplyScheduler() {
  if (schedulerHandle) {
    return;
  }

  schedulerHandle = setInterval(() => {
    void processScheduledReplies();
  }, Math.max(5000, replySchedulerPollMs));
}
