import type { Response } from "express";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z, ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { ReplyTemplateModel } from "../models/reply-template.model";
import { ScheduledEmailModel } from "../models/scheduled-email.model";
import { sendEmailThroughGmail } from "../services/gmail.service";
import { llm, withLlmTimeout } from "../services/llm.service";
import { createNotification } from "../services/notification.service";
import { recordAuditEvent } from "../services/audit.service";
import { emitLiveUpdate } from "../services/live-updates.service";

const composeAttachmentSchema = z.object({
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().min(1).max(24 * 1024 * 1024),
  dataBase64: z.string().trim().min(1),
});

const recurrenceSchema = z.object({
  frequency: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  interval: z.number().int().min(1).max(31).default(1),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
});

const composeBodySchema = z.object({
  accountId: z.string().trim().min(1).nullable().optional(),
  recipients: z.array(z.string().trim().email()).min(1),
  cc: z.array(z.string().trim().email()).default([]),
  bcc: z.array(z.string().trim().email()).default([]),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  htmlBody: z.string().trim().nullable().optional(),
  tone: z.enum(["professional", "friendly", "short", "detailed", "formal", "casual"]).default("professional"),
  attachments: z.array(composeAttachmentSchema).max(10).default([]),
  scheduledAt: z.coerce.date().nullable().optional(),
  timezone: z.string().trim().min(1).default("UTC"),
  recurrence: recurrenceSchema.default({ frequency: "none", interval: 1 }),
  saveAsDraft: z.boolean().default(false),
});

const composeQuerySchema = z.object({
  accountId: z.string().trim().min(1).optional(),
  includeAllAccounts: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
});

const suggestSubjectSchema = z.object({
  body: z.string().trim().min(1),
  recipients: z.array(z.string().trim().email()).default([]),
  tone: z.enum(["professional", "friendly", "short", "detailed", "formal", "casual"]).default("professional"),
});

const scheduledEmailParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const templateBodySchema = z.object({
  name: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  tone: z.enum(["professional", "friendly", "short", "detailed", "formal", "casual"]).default("professional"),
  category: z.string().trim().nullable().optional(),
  sender: z.string().trim().email().nullable().optional(),
  intent: z.string().trim().nullable().optional(),
});

export async function listScheduledEmails(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const query = composeQuerySchema.parse(req.query);
  const scheduledEmails = await ScheduledEmailModel.find({
    userId: req.auth.userId,
    status: { $ne: "cancelled" },
    ...(query.includeAllAccounts
      ? {}
      : query.accountId
        ? { accountId: query.accountId }
        : { accountId: null }),
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: scheduledEmails.map((item) => ({
      ...item,
      _id: String(item._id),
      userId: String(item.userId),
      accountId: item.accountId ? String(item.accountId) : null,
    })),
  });
}

export async function listReplyTemplates(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const templates = await ReplyTemplateModel.find({
    userId: req.auth.userId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: templates.map((item) => ({
      ...item,
      _id: String(item._id),
      userId: String(item.userId),
    })),
  });
}

export async function createReplyTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const payload = templateBodySchema.parse(req.body ?? {});
    const template = await ReplyTemplateModel.create({
      userId: req.auth.userId,
      ...payload,
      sender: payload.sender?.toLowerCase() ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        ...template.toObject(),
        _id: String(template._id),
        userId: String(template.userId),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid reply template", details: error.flatten() });
      return;
    }
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to save reply template" });
  }
}

export async function updateReplyTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const params = scheduledEmailParamsSchema.parse(req.params);
    const payload = templateBodySchema.parse(req.body ?? {});
    const template = await ReplyTemplateModel.findOneAndUpdate(
      { _id: params.id, userId: req.auth.userId },
      {
        $set: {
          ...payload,
          sender: payload.sender?.toLowerCase() ?? null,
        },
      },
      { new: true }
    ).lean();

    if (!template) {
      res.status(404).json({ success: false, error: "Reply template not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        ...template,
        _id: String(template._id),
        userId: String(template.userId),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid reply template update", details: error.flatten() });
      return;
    }
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to update reply template" });
  }
}

export async function deleteReplyTemplate(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const params = scheduledEmailParamsSchema.parse(req.params);
  const template = await ReplyTemplateModel.findOneAndDelete({
    _id: params.id,
    userId: req.auth.userId,
  }).lean();

  if (!template) {
    res.status(404).json({ success: false, error: "Reply template not found" });
    return;
  }

  res.status(200).json({
    success: true,
    data: { id: String(template._id) },
  });
}

export async function createScheduledEmail(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const payload = composeBodySchema.parse(req.body ?? {});
    const isRecurring = payload.recurrence.frequency !== "none";
    const isScheduled = Boolean(payload.scheduledAt) || isRecurring;
    const status = payload.saveAsDraft ? "draft" : isScheduled ? "scheduled" : "sent";

    if (!payload.saveAsDraft && !isScheduled) {
      await sendEmailThroughGmail({
        to: payload.recipients.join(", "),
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body: payload.body,
        htmlBody: payload.htmlBody ?? null,
        accountId: payload.accountId ?? null,
        attachments: payload.attachments,
      });

      await createNotification({
        userId: req.auth.userId,
        type: "success",
        title: "Email sent",
        message: `Your email "${payload.subject}" was sent.`,
      });
      await recordAuditEvent({
        userId: req.auth.userId,
        actorUserId: req.auth.userId,
        kind: "compose-sent",
        title: `Email sent: ${payload.subject}`,
        status: "success",
        targetType: "compose",
        details: {
          recipients: payload.recipients,
        },
      });
      emitLiveUpdate(req.auth.userId, "compose.updated", {
        type: "sent",
        subject: payload.subject,
      });

      res.status(201).json({
        success: true,
        data: {
          status: "sent",
        },
      });
      return;
    }

    const scheduledEmail = await ScheduledEmailModel.create({
      userId: req.auth.userId,
      accountId: payload.accountId ?? null,
      recipients: payload.recipients,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      body: payload.body,
      htmlBody: payload.htmlBody ?? null,
      tone: payload.tone,
      attachments: payload.attachments,
      scheduledAt: payload.scheduledAt ?? null,
      nextRunAt: payload.saveAsDraft ? null : payload.scheduledAt ?? new Date(),
      timezone: payload.timezone,
      recurrence: payload.recurrence,
      status,
    });

    await createNotification({
      userId: req.auth.userId,
      type: payload.saveAsDraft ? "info" : "success",
      title: payload.saveAsDraft ? "Draft saved" : "Email scheduled",
      message: payload.saveAsDraft
        ? `Draft "${payload.subject}" was saved.`
        : `"${payload.subject}" was scheduled successfully.`,
      metadata: {
        scheduledEmailId: String(scheduledEmail._id),
      },
    });
    await recordAuditEvent({
      userId: req.auth.userId,
      actorUserId: req.auth.userId,
      kind: payload.saveAsDraft ? "compose-draft-saved" : "compose-scheduled",
      title: payload.saveAsDraft ? `Draft saved: ${payload.subject}` : `Email scheduled: ${payload.subject}`,
      status: payload.saveAsDraft ? "info" : "success",
      targetType: "compose",
      targetId: String(scheduledEmail._id),
      details: {
        recipients: payload.recipients,
        scheduledAt: scheduledEmail.scheduledAt,
      },
    });
    emitLiveUpdate(req.auth.userId, "compose.updated", {
      type: payload.saveAsDraft ? "draft-saved" : "scheduled",
      data: {
        id: String(scheduledEmail._id),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...scheduledEmail.toObject(),
        _id: String(scheduledEmail._id),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid compose request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create scheduled email",
    });
  }
}

export async function updateScheduledEmail(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const params = scheduledEmailParamsSchema.parse(req.params);
    const payload = composeBodySchema.parse(req.body ?? {});
    const scheduledEmail = await ScheduledEmailModel.findOne({
      _id: params.id,
      userId: req.auth.userId,
      status: { $in: ["draft", "scheduled", "failed"] },
    });

    if (!scheduledEmail) {
      res.status(404).json({ success: false, error: "Scheduled email not found" });
      return;
    }

    scheduledEmail.accountId = payload.accountId ?? null;
    scheduledEmail.recipients = payload.recipients;
    scheduledEmail.cc = payload.cc;
    scheduledEmail.bcc = payload.bcc;
    scheduledEmail.subject = payload.subject;
    scheduledEmail.body = payload.body;
    scheduledEmail.htmlBody = payload.htmlBody ?? null;
    scheduledEmail.tone = payload.tone;
    scheduledEmail.attachments = payload.attachments;
    scheduledEmail.scheduledAt = payload.scheduledAt ?? null;
    scheduledEmail.nextRunAt = payload.saveAsDraft ? null : payload.scheduledAt ?? new Date();
    scheduledEmail.timezone = payload.timezone;
    scheduledEmail.recurrence = payload.recurrence;
    scheduledEmail.status = payload.saveAsDraft ? "draft" : "scheduled";
    scheduledEmail.lastError = null;
    await scheduledEmail.save();
    await recordAuditEvent({
      userId: req.auth.userId,
      actorUserId: req.auth.userId,
      kind: "compose-updated",
      title: `Email updated: ${scheduledEmail.subject}`,
      status: "info",
      targetType: "compose",
      targetId: String(scheduledEmail._id),
      details: {
        status: scheduledEmail.status,
      },
    });
    emitLiveUpdate(req.auth.userId, "compose.updated", {
      type: "updated",
      data: {
        id: String(scheduledEmail._id),
      },
    });

    res.status(200).json({
      success: true,
      data: {
        ...scheduledEmail.toObject(),
        _id: String(scheduledEmail._id),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid scheduled email update request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update scheduled email",
    });
  }
}

export async function deleteScheduledEmail(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const params = scheduledEmailParamsSchema.parse(req.params);
  const scheduledEmail = await ScheduledEmailModel.findOneAndUpdate(
    {
      _id: params.id,
      userId: req.auth.userId,
      status: { $in: ["draft", "scheduled", "failed"] },
    },
    {
      $set: {
        status: "cancelled",
      },
    },
    { new: true }
  ).lean();

  if (!scheduledEmail) {
    res.status(404).json({ success: false, error: "Only draft, scheduled, or failed emails can be deleted" });
    return;
  }

  await recordAuditEvent({
    userId: req.auth.userId,
    actorUserId: req.auth.userId,
    kind: "compose-cancelled",
    title: `Draft cancelled: ${scheduledEmail.subject}`,
    status: "warning",
    targetType: "compose",
    targetId: String(scheduledEmail._id),
  });
  emitLiveUpdate(req.auth.userId, "compose.updated", {
    type: "cancelled",
    data: {
      id: String(scheduledEmail._id),
    },
  });

  res.status(200).json({
    success: true,
    data: {
      id: String(scheduledEmail._id),
      status: scheduledEmail.status,
    },
  });
}

export async function suggestSubjectLines(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const payload = suggestSubjectSchema.parse(req.body ?? {});
    const fallbackSubjects = [
      `Follow-up for ${payload.recipients[0] ?? "your request"}`,
      "Quick follow-up",
      "Checking in",
    ];

    const content = await withLlmTimeout(
      llm
        .invoke([
          new SystemMessage(
            "Suggest exactly three email subject lines. Keep them concise and useful. Return each on a new line only."
          ),
          new HumanMessage(
            `Tone: ${payload.tone}\nRecipients: ${payload.recipients.join(", ")}\nBody:\n${payload.body.slice(0, 800)}`
          ),
        ])
        .then((result) =>
          typeof result.content === "string"
            ? result.content
            : Array.isArray(result.content)
              ? result.content.map((item) => ("text" in item ? item.text : "")).join("\n")
              : fallbackSubjects.join("\n")
        ),
      "compose.suggestSubject",
      () => fallbackSubjects.join("\n")
    );

    const subjects = content
      .split("\n")
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    res.status(200).json({
      success: true,
      data: {
        subjects: subjects.length ? subjects : fallbackSubjects,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid subject suggestion request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to suggest subject lines",
    });
  }
}
