import { Schema, model, models, Types } from "mongoose";

const scheduledEmailSchema = new Schema(
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
    recipients: {
      type: [String],
      required: true,
      default: [],
    },
    cc: {
      type: [String],
      default: [],
    },
    bcc: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    htmlBody: {
      type: String,
      default: null,
    },
    tone: {
      type: String,
      enum: ["professional", "friendly", "short", "detailed", "formal", "casual"],
      default: "professional",
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sending", "sent", "failed", "cancelled"],
      default: "draft",
      index: true,
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    nextRunAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    recurrence: {
      frequency: {
        type: String,
        enum: ["none", "daily", "weekly", "monthly"],
        default: "none",
      },
      interval: {
        type: Number,
        default: 1,
      },
      dayOfWeek: {
        type: Number,
        default: null,
      },
      dayOfMonth: {
        type: Number,
        default: null,
      },
    },
    attachments: {
      type: [
        {
          filename: { type: String, required: true },
          mimeType: { type: String, required: true },
          size: { type: Number, required: true },
          dataBase64: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

scheduledEmailSchema.index({ userId: 1, status: 1, nextRunAt: 1 });

export const ScheduledEmailModel =
  models.ScheduledEmail ?? model("ScheduledEmail", scheduledEmailSchema);
