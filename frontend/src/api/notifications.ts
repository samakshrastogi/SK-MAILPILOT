import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type { AppNotification } from "../types/email";

export async function listNotifications() {
  return request<ApiEnvelope<AppNotification[]>>("/api/notifications");
}

export async function markNotificationRead(id: string) {
  return request<ApiEnvelope<AppNotification>>(`/api/notifications/${id}/read`, {
    method: "POST",
  });
}

export async function markAllNotificationsRead() {
  return request<ApiEnvelope<AppNotification[]>>("/api/notifications/read-all", {
    method: "POST",
  });
}
