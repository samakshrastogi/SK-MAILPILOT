import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type {
  AuthSession,
  AuthUser,
  PendingPasswordResetResponse,
  PendingVerificationResponse,
} from "../types/auth";

export async function registerWithPassword(payload: {
  name: string;
  email: string;
  password: string;
}) {
  return request<ApiEnvelope<PendingVerificationResponse>>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginWithPassword(payload: { email: string; password: string }) {
  return request<ApiEnvelope<AuthSession>>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function forgotPassword(payload: { email: string }) {
  return request<ApiEnvelope<PendingPasswordResetResponse>>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resetPassword(payload: { email: string; otp: string; newPassword: string }) {
  return request<ApiEnvelope<AuthSession>>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyOtp(payload: { email: string; otp: string }) {
  return request<ApiEnvelope<AuthSession>>("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resendOtp(payload: { email: string }) {
  return request<ApiEnvelope<PendingVerificationResponse>>("/api/auth/resend-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCurrentUser() {
  return request<ApiEnvelope<{ user: AuthUser }>>("/api/auth/me");
}

export async function logout() {
  return request<ApiEnvelope<{ loggedOut: boolean }>>("/api/auth/logout", {
    method: "POST",
  });
}

export async function startGoogleLogin(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return request<ApiEnvelope<{ authUrl: string }>>(`/api/auth/google/start${query}`);
}
