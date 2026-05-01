import { Schema, model, models, Types } from "mongoose";

import { persistedEmailCategories } from "../services/email-classification.service";

const emailSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountId: {
      type: Types.ObjectId,
      ref: "GmailAccount",
      default: null,
      index: true,
    },
    numericId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    sender: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    htmlContent: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      enum: persistedEmailCategories,
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    reply: {
      type: String,
      default: null,
    },
    replyTone: {
      type: String,
      enum: ["professional", "friendly", "short", "detailed"],
      default: "professional",
    },
    replyStatus: {
      type: String,
      enum: ["draft", "scheduled", "sent", "failed"],
      default: "draft",
      index: true,
    },
    scheduledReplyAt: {
      type: Date,
      default: null,
      index: true,
    },
    replySentAt: {
      type: Date,
      default: null,
    },
    replyError: {
      type: String,
      default: null,
    },
    needsReply: {
      type: Boolean,
      default: false,
    },
    replyDueAt: {
      type: Date,
      default: null,
      index: true,
    },
    replyRiskStatus: {
      type: String,
      enum: ["none", "on-track", "at-risk", "overdue"],
      default: "none",
      index: true,
    },
    summary: {
      type: String,
      default: "",
    },
    automationActions: {
      type: [String],
      default: [],
    },
    attachments: {
      type: [
        {
          filename: String,
          mimeType: String,
          size: Number,
          attachmentId: String,
          previewUrl: String,
          extractedText: String,
          documentType: String,
          summary: String,
          keyData: [String],
          importantSections: [String],
          extractedFields: [
            {
              label: String,
              value: String,
            },
          ],
        },
      ],
      default: [],
    },
    messageId: {
      type: String,
      trim: true,
      sparse: true,
    },
    gmailThreadId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSpam: {
      type: Boolean,
      default: false,
      index: true,
    },
    originalDate: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    contentHash: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

emailSchema.index({ userId: 1, accountId: 1, subject: 1, contentHash: 1 });
emailSchema.index(
  { userId: 1, accountId: 1, messageId: 1 },
  { unique: true, sparse: true }
);
emailSchema.index({ userId: 1, status: 1, originalDate: -1, updatedAt: -1 });
emailSchema.index({ userId: 1, accountId: 1, status: 1, originalDate: -1, updatedAt: -1 });
emailSchema.index({ userId: 1, status: 1, sender: 1 });
emailSchema.index({ userId: 1, accountId: 1, status: 1, sender: 1 });
emailSchema.index({ userId: 1, status: 1, priority: 1 });
emailSchema.index({ userId: 1, accountId: 1, status: 1, priority: 1 });
emailSchema.index({ userId: 1, status: 1, category: 1 });
emailSchema.index({ userId: 1, accountId: 1, status: 1, category: 1 });
emailSchema.index({ userId: 1, status: 1, needsReply: 1, replyStatus: 1 });
emailSchema.index({ userId: 1, accountId: 1, status: 1, needsReply: 1, replyStatus: 1 });

export const EmailModel = models.Email ?? model("Email", emailSchema);
