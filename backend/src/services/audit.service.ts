import mongoose from "mongoose";

import { AuditEventModel } from "../models/audit-event.model";
import { emitLiveUpdate } from "./live-updates.service";

export async function recordAuditEvent(input: {
  userId: string;
  actorUserId?: string | null;
  kind: string;
  title: string;
  status?: "success" | "warning" | "error" | "info";
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const event = await AuditEventModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    actorUserId: input.actorUserId ? new mongoose.Types.ObjectId(input.actorUserId) : null,
    kind: input.kind,
    title: input.title,
    status: input.status ?? "info",
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    details: input.details ?? null,
  });

  emitLiveUpdate(input.userId, "audit.updated", {
    type: "audit-event",
    data: {
      id: String(event._id),
      kind: event.kind,
      title: event.title,
      status: event.status,
      targetType: event.targetType,
      targetId: event.targetId,
      details: event.details,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    },
  });

  return event;
}
