import type { Response } from "express";

type LiveEventName =
  | "notification.created"
  | "notification.updated"
  | "sync.progress"
  | "mail-access.updated"
  | "compose.updated"
  | "audit.updated";

type LiveSink = {
  id: string;
  response: Response;
};

const sinksByUser = new Map<string, LiveSink[]>();

function writeEvent(response: Response, event: LiveEventName | "connected", payload: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerLiveUpdateStream(userId: string, response: Response) {
  const sink: LiveSink = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    response,
  };
  const sinks = sinksByUser.get(userId) ?? [];
  sinks.push(sink);
  sinksByUser.set(userId, sinks);

  writeEvent(response, "connected", {
    ok: true,
    userId,
    connectedAt: new Date().toISOString(),
  });

  return () => {
    const current = sinksByUser.get(userId) ?? [];
    const next = current.filter((item) => item.id !== sink.id);
    if (next.length) {
      sinksByUser.set(userId, next);
    } else {
      sinksByUser.delete(userId);
    }
  };
}

export function emitLiveUpdate(userId: string, event: LiveEventName, payload: unknown) {
  const sinks = sinksByUser.get(userId) ?? [];
  for (const sink of sinks) {
    writeEvent(sink.response, event, payload);
  }
}
