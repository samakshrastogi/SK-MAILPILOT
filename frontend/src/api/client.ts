import { getRequiredViteEnv } from "../config/env";

const API_BASE_URL = getRequiredViteEnv("VITE_API_BASE_URL");
const configuredCentralAuthBaseUrl = import.meta.env.VITE_SK_CENTRAL_AUTH_URL ?? "http://localhost:4002/api";
const CENTRAL_AUTH_BASE_URL = (import.meta.env.PROD && configuredCentralAuthBaseUrl.includes("sk-central.onrender.com")
  ? "https://www.sk-hub.in/api"
  : configuredCentralAuthBaseUrl).replace(/\/$/, "");
const CENTRAL_LOGIN_URL = import.meta.env.VITE_SK_CENTRAL_LOGIN_URL ?? "http://localhost:5475/login";
export const CENTRAL_PROFILE_URL = import.meta.env.VITE_SK_CENTRAL_PROFILE_URL ?? CENTRAL_LOGIN_URL.replace(/\/login\/?$/, "/profile");

type ApiRequestErrorPayload = { message: string; status: number };
type ApiErrorPayload = { success?: boolean; error?: string; details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] } };
type CentralAppTokenResponse = { data: { token: string } };
export type ApiEnvelope<T> = { success: boolean; data: T; error?: string };

export class ApiRequestError extends Error {
  status: number;
  constructor({ message, status }: ApiRequestErrorPayload) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

let authToken: string | null = null;
let appTokenPromise: Promise<string> | null = null;
export function getAuthToken() { return authToken; }
export function getApiBaseUrl() { return API_BASE_URL; }
export function setAuthToken(token: string | null) { authToken = token; }

export function redirectToCentralLogin() {
  window.location.assign(`${CENTRAL_LOGIN_URL}?returnTo=${encodeURIComponent(window.location.href)}`);
}

export async function requestCentralAppToken() {
  if (appTokenPromise) return appTokenPromise;
  appTokenPromise = fetch(`${CENTRAL_AUTH_BASE_URL}/auth/app-token?appId=sk-mailpilot`, { credentials: "include", headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new ApiRequestError({ message: "SK Central login required", status: response.status });
      const payload = (await response.json()) as CentralAppTokenResponse;
      authToken = payload.data.token;
      return payload.data.token;
    })
    .finally(() => { appTokenPromise = null; });
  return appTokenPromise;
}

export async function getCentralSessionState(): Promise<boolean | null> {
  try {
    const response = await fetch(`${CENTRAL_AUTH_BASE_URL}/auth/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { authenticated?: boolean } };
    return payload.data?.authenticated === true;
  } catch {
    return null;
  }
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiErrorPayload;
  if (!response.ok || payload.success === false) {
    const fieldErrorSummary = payload.details?.fieldErrors
      ? Object.entries(payload.details.fieldErrors).flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`)).join(", ")
      : "";
    throw new ApiRequestError({ message: [payload.error ?? "Request failed", fieldErrorSummary].filter(Boolean).join(". "), status: response.status });
  }
  return payload as T;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const execute = (token: string) => {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };
  let token = getAuthToken() ?? await requestCentralAppToken();
  let response = await execute(token);
  if (response.status === 401) {
    setAuthToken(null);
    token = await requestCentralAppToken();
    response = await execute(token);
  }
  return parseResponse<T>(response);
}
