import mongoose from "mongoose";

import { ScheduledEmailModel } from "../models/scheduled-email.model";
import { sendEmailThroughGmail } from "./gmail.service";
import { createNotification } from "./notification.service";
import { logger } from "../utils/logger";

const composeSchedulerPollMs = Number(process.env.COMPOSE_SCHEDULER_POLL_MS ?? 30000);
let composeSchedulerHandle: NodeJS.Timeout | null = null;
let composeSchedulerBusy = false;

function addRecurrence(date: Date, recurrence: {
  frequency?: string | null;
  interval?: number | null;
}) {
  const next = new Date(date);
  const interval = Math.max(1, recurrence.interval ?? 1);

  if (recurrence.frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + interval);
    return next;
  }

  if (recurrence.frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + interval * 7);
    return next;
  }

  if (recurrence.frequency === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + interval);
    return next;
  }

  return null;
}

export async function processScheduledComposedEmails() {
  if (composeSchedulerBusy || mongoose.connection.readyState !== 1) {
    return;
  }

  composeSchedulerBusy = true;

  try {
    const dueEmails = await ScheduledEmailModel.find({
      status: { $in: ["scheduled", "failed"] },
      nextRunAt: { $lte: new Date() },
    })
      .sort({ nextRunAt: 1 })
      .limit(20);

    for (const item of dueEmails) {
      try {
        item.status = "sending";
        await item.save();

        await sendEmailThroughGmail({
          to: item.recipients.join(", "),
          cc: item.cc ?? [],
          bcc: item.bcc ?? [],
          subject: item.subject,
          body: item.body,
          htmlBody: item.htmlBody,
          accountId: item.accountId ? String(item.accountId) : null,
          attachments: (item.attachments ?? []).map((attachment: {
            filename: string;
            mimeType: string;
            size: number;
            dataBase64: string;
          }) => ({
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            dataBase64: attachment.dataBase64,
          })),
        });

        const sentAt = new Date();
        const nextRunAt = addRecurrence(sentAt, item.recurrence ?? {});

        item.lastSentAt = sentAt;
        item.lastError = null;
        item.status = nextRunAt ? "scheduled" : "sent";
        item.nextRunAt = nextRunAt;
        await item.save();

        await createNotification({
          userId: String(item.userId),
          type: "success",
          title: "Scheduled email sent",
          message: `Your scheduled email "${item.subject}" was sent successfully.`,
          metadata: {
            scheduledEmailId: String(item._id),
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown send failure";
        item.status = "failed";
        item.lastError = errorMessage;
        await item.save();

        await createNotification({
          userId: String(item.userId),
          type: "error",
          title: "Scheduled email failed",
          message: `Failed to send "${item.subject}": ${errorMessage}`,
          metadata: {
            scheduledEmailId: String(item._id),
          },
        });

        logger.warn("Scheduled compose send failed", {
          id: String(item._id),
          error: errorMessage,
        });
      }
    }

    const upcomingThreshold = new Date(Date.now() + 15 * 60 * 1000);
    const upcomingItems = await ScheduledEmailModel.find({
      status: "scheduled",
      nextRunAt: { $gt: new Date(), $lte: upcomingThreshold },
    }).limit(10);

    for (const item of upcomingItems) {
      await createNotification({
        userId: String(item.userId),
        type: "info",
        title: "Upcoming scheduled email",
        message: `"${item.subject}" is scheduled for ${item.nextRunAt?.toLocaleString() ?? "soon"}.`,
        metadata: {
          scheduledEmailId: String(item._id),
          nextRunAt: item.nextRunAt,
        },
      });
    }
  } finally {
    composeSchedulerBusy = false;
  }
}

export function startComposeScheduler() {
  if (composeSchedulerHandle) {
    return;
  }

  composeSchedulerHandle = setInterval(() => {
    void processScheduledComposedEmails();
  }, Math.max(5000, composeSchedulerPollMs));
}
