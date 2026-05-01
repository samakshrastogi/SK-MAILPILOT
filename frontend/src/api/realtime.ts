import { getApiBaseUrl, getAuthToken } from "./client";
import type { RealtimeEvent } from "../types/email";

export function openRealtimeStream(onEvent: (event: RealtimeEvent) => void) {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  const baseUrl = getApiBaseUrl();
  const eventSource = new EventSource(
    `${baseUrl}/api/realtime/stream?token=${encodeURIComponent(token)}`
  );

  const names = [
    "connected",
    "notification.created",
    "notification.updated",
    "sync.progress",
    "mail-access.updated",
    "compose.updated",
    "audit.updated",
  ] as const;

  for (const name of names) {
    eventSource.addEventListener(name, (rawEvent) => {
      try {
        const message = rawEvent as MessageEvent<string>;
        onEvent({
          event: name,
          data: JSON.parse(message.data),
        } as RealtimeEvent);
      } catch {
        // Ignore malformed transient payloads.
      }
    });
  }

  return eventSource;
}
