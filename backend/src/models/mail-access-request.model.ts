import { Schema, model, models, Types } from "mongoose";

const mailAccessRequestSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      required: true,
      trim: true,
    },
    requesterEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    loginEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    requestedAccountEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    requestedEmailOtpHash: {
      type: String,
      default: undefined,
    },
    requestedEmailOtpExpiresAt: {
      type: Date,
      default: undefined,
    },
    requestedEmailVerifiedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved"],
      default: "pending",
      index: true,
    },
    notificationSentAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedByEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

mailAccessRequestSchema.index(
  { requesterEmail: 1, requestedAccountEmail: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending"] } } }
);

export const MailAccessRequestModel =
  models.MailAccessRequest ?? model("MailAccessRequest", mailAccessRequestSchema);
