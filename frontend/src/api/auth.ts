import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type { AuthUser } from "../types/auth";

export function getCurrentUser() {
  return request<ApiEnvelope<{ user: AuthUser }>>("/api/auth/me");
}

export function updateProfile(payload: { coverPhotoUrl?: string }) {
  return request<ApiEnvelope<{ user: AuthUser }>>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
