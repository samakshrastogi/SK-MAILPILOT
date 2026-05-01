import type { Response } from "express";
import { z, ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service";

const notificationParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const notifications = await listUserNotifications(req.auth.userId, 50);

  res.status(200).json({
    success: true,
    data: notifications.map((notification) => ({
      ...notification,
      _id: String(notification._id),
      userId: String(notification.userId),
    })),
  });
}

export async function readNotification(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const params = notificationParamsSchema.parse(req.params);
    const notification = await markNotificationRead(req.auth.userId, params.id);

    if (!notification) {
      res.status(404).json({ success: false, error: "Notification not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        ...notification,
        _id: String(notification._id),
        userId: String(notification.userId),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid notification request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update notification",
    });
  }
}

export async function readAllNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.auth?.userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const notifications = await markAllNotificationsRead(req.auth.userId);

    res.status(200).json({
      success: true,
      data: notifications.map((notification) => ({
        ...notification,
        _id: String(notification._id),
        userId: String(notification.userId),
      })),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update notifications",
    });
  }
}
