import { NotificationModel } from "../models/notification.model";
import { recordAuditEvent } from "./audit.service";
import { emitLiveUpdate } from "./live-updates.service";

export async function createNotification(input: {
  userId: string;
  type?: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const duplicate = await NotificationModel.findOne({
    userId: input.userId,
    title: input.title,
    message: input.message,
    createdAt: {
      $gte: new Date(Date.now() - 15 * 60 * 1000),
    },
  }).lean();

  if (duplicate) {
    return duplicate;
  }

  const notification = await NotificationModel.create({
    userId: input.userId,
    type: input.type ?? "info",
    title: input.title,
    message: input.message,
    metadata: input.metadata ?? null,
  });

  emitLiveUpdate(input.userId, "notification.created", {
    type: "notification",
    data: {
      ...notification.toObject(),
      _id: String(notification._id),
      userId: String(notification.userId),
    },
  });

  await recordAuditEvent({
    userId: input.userId,
    kind: "notification-created",
    title: input.title,
    status:
      input.type === "error"
        ? "error"
        : input.type === "warning"
          ? "warning"
          : input.type === "success"
            ? "success"
            : "info",
    targetType: "notification",
    targetId: String(notification._id),
    details: {
      message: input.message,
      metadata: input.metadata ?? null,
    },
  });

  return notification;
}

export async function listUserNotifications(userId: string, limit = 20) {
  return NotificationModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();

  if (notification) {
    emitLiveUpdate(userId, "notification.updated", {
      type: "notification",
      data: {
        ...notification,
        _id: String(notification._id),
        userId: String(notification.userId),
      },
    });
  }

  return notification;
}

export async function markAllNotificationsRead(userId: string) {
  const readAt = new Date();
  await NotificationModel.updateMany(
    {
      userId,
      readAt: null,
    },
    {
      $set: { readAt },
    }
  );

  const notifications = await NotificationModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  emitLiveUpdate(userId, "notification.updated", {
    type: "notifications-read-all",
    data: notifications.map((notification) => ({
      ...notification,
      _id: String(notification._id),
      userId: String(notification.userId),
    })),
  });

  return notifications;
}
