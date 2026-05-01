import { logger } from "../utils/logger";
import { emitLiveUpdate } from "./live-updates.service";

type SyncProgressState = {
  userId: string;
  status: "idle" | "running" | "completed" | "failed";
  phase: "fetching" | "processing" | "completed" | "failed";
  fetchedCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  totalEstimated: number;
  percentage: number;
  partialDataAvailable: boolean;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number;
  message: string;
  error: string | null;
  lastLoggedPercent: number;
};

const progressByUser = new Map<string, SyncProgressState>();

function createIdleState(userId: string): SyncProgressState {
  return {
    userId,
    status: "idle",
    phase: "completed",
    fetchedCount: 0,
    processedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalEstimated: 0,
    percentage: 0,
    partialDataAvailable: false,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    message: "No sync in progress",
    error: null,
    lastLoggedPercent: -1,
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function recomputePercentage(state: SyncProgressState) {
  if (!state.totalEstimated) {
    state.percentage = state.status === "completed" ? 100 : 0;
    return;
  }

  if (state.phase === "fetching") {
    state.percentage = clampPercent((state.fetchedCount / state.totalEstimated) * 50);
    return;
  }

  if (state.phase === "processing") {
    const processedWork = state.processedCount + state.failedCount + state.skippedCount;
    state.percentage = clampPercent(50 + (processedWork / state.totalEstimated) * 50);
    return;
  }

  state.percentage = state.status === "completed" ? 100 : state.percentage;
}

function maybeLogPercent(state: SyncProgressState) {
  const rounded = Math.floor(state.percentage / 5) * 5;
  if (rounded <= state.lastLoggedPercent || rounded <= 0) {
    return;
  }

  state.lastLoggedPercent = rounded;
  logger.info("Inbox sync progress", {
    percentage: rounded,
    phase: state.phase,
    fetchedCount: state.fetchedCount,
    processedCount: state.processedCount,
    failedCount: state.failedCount,
    skippedCount: state.skippedCount,
    totalEstimated: state.totalEstimated,
  });
}

export function startSyncProgress(userId: string, message = "Fetching inbox emails") {
  const state: SyncProgressState = {
    ...createIdleState(userId),
    status: "running",
    phase: "fetching",
    startedAt: Date.now(),
    message,
  };
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
  return state;
}

export function addSyncEstimatedTotal(userId: string, totalEstimated: number) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  state.totalEstimated += Math.max(0, totalEstimated);
  recomputePercentage(state);
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function updateSyncFetched(userId: string, fetchedCount: number, skippedCount = 0) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  state.phase = "processing";
  state.fetchedCount += fetchedCount;
  state.skippedCount += skippedCount;
  state.durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
  state.partialDataAvailable = state.processedCount + state.skippedCount > 0;
  state.message =
    state.skippedCount > 0
      ? "Processing remaining emails"
      : "Processing fetched emails";
  recomputePercentage(state);
  maybeLogPercent(state);
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function incrementFetchedEmail(userId: string) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  state.phase = "fetching";
  state.fetchedCount += 1;
  state.durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
  state.message = "Fetching inbox emails";
  recomputePercentage(state);
  maybeLogPercent(state);
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function incrementSyncProcessed(userId: string, failed = false) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  if (failed) {
    state.failedCount += 1;
  } else {
    state.processedCount += 1;
  }
  state.phase = "processing";
  state.durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
  state.partialDataAvailable = state.processedCount + state.skippedCount > 0;
  state.message =
    state.skippedCount > 0
      ? "Processing remaining emails"
      : "Processing fetched emails";
  recomputePercentage(state);
  maybeLogPercent(state);
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function completeSyncProgress(userId: string, input: {
  fetchedCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
}) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  state.status = "completed";
  state.phase = "completed";
  state.fetchedCount = Math.max(state.fetchedCount, input.fetchedCount);
  state.processedCount = input.processedCount;
  state.failedCount = input.failedCount;
  state.skippedCount = input.skippedCount;
  state.durationMs = input.durationMs;
  state.completedAt = Date.now();
  state.totalEstimated = Math.max(
    state.totalEstimated,
    input.processedCount + input.skippedCount + input.failedCount
  );
  state.partialDataAvailable = input.processedCount + input.skippedCount > 0;
  state.percentage = 100;
  state.message = "Inbox sync complete";
  state.lastLoggedPercent = 100;
  logger.info("Inbox sync progress", {
    percentage: 100,
    phase: "completed",
    fetchedCount: state.fetchedCount,
    processedCount: state.processedCount,
    failedCount: state.failedCount,
    skippedCount: state.skippedCount,
    totalEstimated: state.totalEstimated,
  });
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function failSyncProgress(userId: string, error: string) {
  const state = progressByUser.get(userId) ?? startSyncProgress(userId);
  state.status = "failed";
  state.phase = "failed";
  state.error = error;
  state.completedAt = Date.now();
  state.durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
  state.message = "Inbox sync failed";
  recomputePercentage(state);
  progressByUser.set(userId, state);
  emitLiveUpdate(userId, "sync.progress", state);
}

export function getSyncProgress(userId: string) {
  const state = progressByUser.get(userId) ?? createIdleState(userId);
  if (state.startedAt && state.status === "running") {
    state.durationMs = Date.now() - state.startedAt;
  }
  return state;
}
