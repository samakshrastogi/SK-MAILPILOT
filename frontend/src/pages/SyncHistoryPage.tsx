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
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">History</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sync history</h2>
          <p className="mt-2 text-sm text-slate-500">Per-run sync stats and failure reasons.</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Check what each sync fetched, processed, skipped, or failed.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Auto-updating"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        {history.length ? (
          <div className="space-y-4">
            {history.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {entry.status === "completed" ? "Completed sync" : "Failed sync"}
                      </h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-sm text-slate-600">
                    Duration: <span className="font-medium text-slate-900">{formatDuration(entry.durationMs)}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Fetched</span><span className="mt-1 block font-semibold text-slate-900">{entry.fetchedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Processed</span><span className="mt-1 block font-semibold text-slate-900">{entry.processedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Skipped</span><span className="mt-1 block font-semibold text-slate-900">{entry.skippedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Failed</span><span className="mt-1 block font-semibold text-slate-900">{entry.failedCount}</span></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Labels</span><span className="mt-1 block font-semibold text-slate-900">{entry.labelIds.join(", ") || "INBOX"}</span></div>
                </div>
                {entry.failureReasons.length ? (
                  <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
