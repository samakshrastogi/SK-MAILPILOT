import { Schema, model, models, Types } from "mongoose";

const replyTemplateSchema = new Schema(
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
    tone: {
      type: String,
      enum: ["professional", "friendly", "short", "detailed", "formal", "casual"],
      default: "professional",
    },
    category: {
      type: String,
      default: null,
      trim: true,
    },
    sender: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    intent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

replyTemplateSchema.index({ userId: 1, createdAt: -1 });

export const ReplyTemplateModel =
  models.ReplyTemplate ?? model("ReplyTemplate", replyTemplateSchema);
