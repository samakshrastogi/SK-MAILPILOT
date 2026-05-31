import { useCallback, useEffect, useState } from "react";
import { FiActivity } from "react-icons/fi";

import { listSyncHistory } from "../api/email";
import { useRealtimeStream } from "../hooks/useRealtimeStream";
import type { SyncHistoryEntry } from "../types/email";

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

function sortSyncHistoryLatestFirst(entries: SyncHistoryEntry[]) {
  return [...entries].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

type SyncHistoryPageProps = {
  accountId?: string | null;
  includeAllAccounts?: boolean;
};

export function SyncHistoryPage({ accountId, includeAllAccounts }: SyncHistoryPageProps) {
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await listSyncHistory(20, { accountId, includeAllAccounts });
      setHistory(sortSyncHistoryLatestFirst(response.data));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load sync history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory(true);
  }, [accountId, includeAllAccounts]);

  useRealtimeStream(
    useCallback((event) => {
      if (event.event === "notification.created" || event.event === "audit.updated") {
        void loadHistory();
      }
    }, [accountId, includeAllAccounts])
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:rounded-[28px] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">History</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Sync history</h2>
          <p className="mt-2 text-sm text-slate-500">Per-run sync stats and failure reasons.</p>
          <p className="mt-1 hidden text-xs leading-5 text-slate-400 sm:block">
            Check what each sync fetched, processed, skipped, or failed.
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Auto-updating"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm sm:rounded-[28px] sm:p-4">
        {history.length ? (
          <div className="space-y-3 sm:space-y-4">
            {history.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {entry.status === "completed" ? "Completed sync" : "Failed sync"}
                      </h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${entry.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-xs text-slate-600 sm:text-sm">
                    Duration: <span className="font-medium text-slate-900">{formatDuration(entry.durationMs)}</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5">
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm sm:py-3"><span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">Fetched</span><span className="mt-0.5 block font-semibold text-slate-900 sm:mt-1">{entry.fetchedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm sm:py-3"><span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">Processed</span><span className="mt-0.5 block font-semibold text-slate-900 sm:mt-1">{entry.processedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm sm:py-3"><span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">Skipped</span><span className="mt-0.5 block font-semibold text-slate-900 sm:mt-1">{entry.skippedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm sm:py-3"><span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">Failed</span><span className="mt-0.5 block font-semibold text-slate-900 sm:mt-1">{entry.failedCount}</span></div>
                  <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-sm sm:col-span-1 sm:py-3"><span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">Labels</span><span className="mt-0.5 block truncate font-semibold text-slate-900 sm:mt-1">{entry.labelIds.join(", ") || "INBOX"}</span></div>
                </div>
                {entry.failureReasons.length ? (
                  <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:mt-4 sm:px-4 sm:py-3 sm:text-sm">
                    {entry.failureReasons.join(" | ")}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FiActivity className="text-3xl text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No sync history yet</p>
            <p className="text-xs text-slate-400">Run inbox sync to start tracking activity.</p>
          </div>
        )}
      </section>
    </div>
  );
}
