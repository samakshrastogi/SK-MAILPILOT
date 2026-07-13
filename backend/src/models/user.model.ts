import { Schema, model, models, Types } from "mongoose";

const userSchema = new Schema(
  {
    skCentralUserId: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    avatarUrl: { type: String, default: undefined, trim: true },
    avatarInitials: { type: String, default: undefined, trim: true },
    coverPhotoUrl: { type: String, default: undefined, trim: true },
    emailVerified: { type: Boolean, default: true, index: true },
    authProviders: { type: [String], default: ["sk-central"] },
    role: { type: String, enum: ["member", "reviewer", "admin"], default: "member", index: true },
    primaryAccountId: { type: Types.ObjectId, ref: "GmailAccount", default: null },
  },
  { timestamps: true, versionKey: false }
);

export const UserModel = models.User ?? model("User", userSchema);
