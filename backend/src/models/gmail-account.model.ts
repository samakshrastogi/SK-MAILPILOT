import { Schema, model, models, Types } from "mongoose";

const gmailAccountSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerUserId: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reviewerUserIds: {
      type: [
        {
          type: Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    provider: {
      type: String,
      default: "google",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      default: "",
    },
    googleSubject: {
      type: String,
      required: true,
      index: true,
    },
    accessToken: {
      type: String,
      default: null,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    scope: {
      type: String,
      default: "",
    },
    tokenExpiryDate: {
      type: Date,
      default: null,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "pending_approval", "disconnected"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

gmailAccountSchema.index({ userId: 1, email: 1 }, { unique: true });

export const GmailAccountModel =
  models.GmailAccount ?? model("GmailAccount", gmailAccountSchema);
