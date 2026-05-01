import { Schema, model, models, Types } from "mongoose";

const auditEventSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorUserId: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    kind: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["success", "warning", "error", "info"],
      default: "info",
      index: true,
    },
    targetType: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    targetId: {
      type: String,
      default: null,
      trim: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

auditEventSchema.index({ userId: 1, createdAt: -1 });

export const AuditEventModel = models.AuditEvent ?? model("AuditEvent", auditEventSchema);
