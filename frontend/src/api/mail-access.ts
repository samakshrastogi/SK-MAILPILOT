import { request } from "./client";
import type { ApiEnvelope } from "./client";
import type { MailAccessRequest } from "../types/auth";

export async function startMailAccessRequest(payload: { requestedAccountEmail: string }) {
  return request<
    ApiEnvelope<{
      requestedAccountEmail: string;
      alreadyApproved: boolean;
      requestStatus?: "approved" | "pending" | "verification_required";
      authUrl: string | null;
    }>
  >("/api/mail-access/request/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listMailAccessRequests() {
  return request<ApiEnvelope<MailAccessRequest[]>>("/api/mail-access");
}

export async function listMyMailAccessRequests() {
  return request<ApiEnvelope<MailAccessRequest[]>>("/api/mail-access/mine");
}

export async function approveMailAccessRequest(id: string) {
  return request<
    ApiEnvelope<{
      id: string;
      status: string;
      approvedAt: string;
    }>
  >(`/api/mail-access/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectMailAccessRequest(id: string) {
  return request<
    ApiEnvelope<{
      id: string;
      status: string;
    }>
  >(`/api/mail-access/${id}/reject`, {
    method: "POST",
  });
}
