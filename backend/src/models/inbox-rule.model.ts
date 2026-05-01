import { Schema, model, models, Types } from "mongoose";

const inboxRuleSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    senderContains: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    subjectContains: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    bodyContains: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    setPriority: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    setCategory: {
      type: String,
      enum: ["work", "personal", "spam", "finance", "promotions", "updates", "other", null],
      default: null,
    },
    markNeedsReply: {
      type: Boolean,
      default: null,
    },
    autoArchive: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

inboxRuleSchema.index({ userId: 1, active: 1, createdAt: -1 });

export const InboxRuleModel =
  models.InboxRule ?? model("InboxRule", inboxRuleSchema);
