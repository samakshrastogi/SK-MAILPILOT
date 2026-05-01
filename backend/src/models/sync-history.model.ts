import { Schema, model, models, Types } from "mongoose";

const syncHistorySchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountIds: {
      type: [Types.ObjectId],
      ref: "GmailAccount",
      default: [],
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      required: true,
      index: true,
    },
    labelIds: {
      type: [String],
      default: ["INBOX"],
    },
    query: {
      type: String,
      default: null,
      trim: true,
    },
    requestedCount: {
      type: Schema.Types.Mixed,
      default: null,
    },
    fetchedCount: {
      type: Number,
      default: 0,
    },
    processedCount: {
      type: Number,
      default: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    failureReasons: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

syncHistorySchema.index({ userId: 1, createdAt: -1 });

export const SyncHistoryModel =
  models.SyncHistory ?? model("SyncHistory", syncHistorySchema);
