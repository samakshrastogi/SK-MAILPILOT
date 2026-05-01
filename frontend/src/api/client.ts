const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const AUTH_STORAGE_KEY = "sk-mailpilot-auth-token";
export const AUTH_USER_STORAGE_KEY = "sk-mailpilot-auth-user";

type ApiRequestErrorPayload = {
  message: string;
  status: number;
};

type ApiErrorPayload = {
  success?: boolean;
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export class ApiRequestError extends Error {
  status: number;

  constructor({ message, status }: ApiRequestErrorPayload) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setAuthToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function getStoredAuthUser<T>() {
  const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(value: unknown | null) {
  if (value) {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
}

export function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as ApiErrorPayload;
  if (!response.ok || payload.success === false) {
    const fieldErrorSummary = payload.details?.fieldErrors
      ? Object.entries(payload.details.fieldErrors)
          .flatMap(([field, messages]) =>
            (messages ?? []).map((message) => `${field}: ${message}`)
          )
          .join(", ")
      : "";

    throw new ApiRequestError({
      message: [payload.error ?? "Request failed", fieldErrorSummary].filter(Boolean).join(". "),
      status: response.status,
    });
  }

  return payload as T;
}
