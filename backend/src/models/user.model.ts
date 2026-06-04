import { Schema, model, models, Types } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: undefined,
      trim: true,
    },
    coverPhotoUrl: {
      type: String,
      default: undefined,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailVerificationOtpHash: {
      type: String,
      default: undefined,
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      default: undefined,
    },
    emailVerificationLastSentAt: {
      type: Date,
      default: undefined,
    },
    passwordResetOtpHash: {
      type: String,
      default: undefined,
    },
    passwordResetOtpExpiresAt: {
      type: Date,
      default: undefined,
    },
    passwordResetLastSentAt: {
      type: Date,
      default: undefined,
    },
    googleSubject: {
      type: String,
      default: undefined,
      unique: true,
      sparse: true,
      index: true,
    },
    authProviders: {
      type: [String],
      default: ["password"],
    },
    role: {
      type: String,
      enum: ["member", "reviewer", "admin"],
      default: "member",
      index: true,
    },
    primaryAccountId: {
      type: Types.ObjectId,
      ref: "GmailAccount",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const UserModel = models.User ?? model("User", userSchema);
