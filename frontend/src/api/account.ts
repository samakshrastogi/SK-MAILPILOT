import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type { GmailAccount } from "../types/auth";

export async function listGmailAccounts() {
  return request<ApiEnvelope<GmailAccount[]>>("/api/accounts");
}

export async function startGoogleAccountConnect(requestedAccountEmail?: string, returnTo?: string) {
  const params = new URLSearchParams();
  if (requestedAccountEmail) {
    params.set("requestedAccountEmail", requestedAccountEmail);
  }
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<ApiEnvelope<{ authUrl: string }>>(`/api/accounts/google/start${query}`);
}
