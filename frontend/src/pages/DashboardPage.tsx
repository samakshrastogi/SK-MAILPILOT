import { useEffect, useState } from "react";

import { listSyncHistory } from "../api/email";
import { StatCard } from "../components/StatCard";
import type { useMailPilotData } from "../hooks/useMailPilotData";
import type { SyncHistoryEntry, SyncProgress } from "../types/email";
type DashboardPageProps = {
  mailPilot: ReturnType<typeof useMailPilotData>;
  syncProgress?: SyncProgress | null;
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

export function DashboardPage({
  mailPilot,
  syncProgress = null,
}: DashboardPageProps) {
  const [, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const analytics = mailPilot.analytics;
  const priorityItems = analytics?.priorityBreakdown ?? [];
  const topSenders = analytics?.topSenders ?? [];
  const categoryItems = analytics?.categoryDistribution ?? [];

  useEffect(() => {
    let cancelled = false;

    async function loadSyncHistory() {
      try {
        const response = await listSyncHistory(4);
        if (!cancelled) {
          setSyncHistory(response.data);
        }
      } catch {
        if (!cancelled) {
          setSyncHistory([]);
        }
      }
    }

    void loadSyncHistory();

    return () => {
      cancelled = true;
    };
  }, [mailPilot.lastSyncAt]);

  function openPendingInbox() {
    mailPilot.setPage(1);
    mailPilot.setSearch("");
    mailPilot.setSemanticMode(false);
    mailPilot.setSenderFilter("all");
    mailPilot.setCategoryFilter("all");
    mailPilot.setPriorityFilter("all");
    mailPilot.setSortBy("latest");
    mailPilot.setPendingOnly(true);
    mailPilot.setDateFrom("");
    mailPilot.setDateTo("");
    window.location.hash = "/emails";
  }

  const visibleProcessedCount = syncProgress
    ? syncProgress.processedCount + syncProgress.skippedCount
    : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* 🔹 Header */}
      <section className="overflow-hidden rounded-[28px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5 shadow-[0_20px_60px_-40px_rgba(14,116,144,0.45)] transition-all duration-200 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-700">
              Overview
            </p>

            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {mailPilot.stats?.processedEmails ?? 0}
              </h2>
              <span className="pb-1 text-sm font-medium text-slate-500">
                processed emails
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-slate-500">
              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm ring-1 ring-sky-100">
                Last sync {formatDuration(mailPilot.lastSyncDurationMs ?? 0)}
              </span>
              {mailPilot.lastSyncAt ? (
                <span className="rounded-full bg-slate-100/90 px-3 py-1 font-medium text-slate-600">
                  {new Date(mailPilot.lastSyncAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Start here to review inbox health, pending replies, and recent activity.
            </p>
            {mailPilot.syncing && syncProgress ? (
              <div className="mt-5 max-w-xl rounded-2xl border border-sky-100 bg-white/80 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{syncProgress.message}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                    {syncProgress.percentage}%
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                    style={{ width: `${syncProgress.percentage}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {visibleProcessedCount} processed of {syncProgress.totalEstimated || syncProgress.fetchedCount || 0}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/sender-insights";
              }}
              className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
            >
              Insights
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/sync-history";
              }}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Sync History
            </button>
          </div>
        </div>
      </section>

      {/* 🔹 Stats */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total"
          value={mailPilot.stats?.totalEmails ?? 0}
        />
        <StatCard
          label="Processed"
          value={mailPilot.stats?.processedEmails ?? 0}
        />
        <StatCard
          label="Pending"
          value={mailPilot.followUps?.count ?? mailPilot.stats?.remainingEmails ?? 0}
          tone="alert"
          helper={mailPilot.followUps?.alert ?? ""}
          onClick={openPendingInbox}
        />
        <StatCard label="Today" value={analytics?.totals.daily ?? 0} />
        <StatCard label="Week" value={analytics?.totals.weekly ?? 0} />
        <StatCard label="Month" value={analytics?.totals.monthly ?? 0} />
      </section>

      {/* 🔹 Main Grid */}
      <section className="grid lg:grid-cols-2 gap-5">

        {/* Follow-ups */}
        <div className="min-w-0 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Pending Replies
            </h3>

            {/* optional subtle indicator */}
            {((mailPilot.followUps?.emails?.length ?? 0) > 0) && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {mailPilot.followUps?.emails?.length ?? 0} pending
              </span>
            )}
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Review messages that still need a response.
          </p>

          {/* Status */}
          <p className="text-sm text-slate-500 leading-relaxed">
            {mailPilot.followUps?.alert ?? "No replies pending"}
          </p>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={openPendingInbox}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium 
        bg-gradient-to-r from-blue-600 to-indigo-600 text-white
        shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]
        transition-all duration-200"
            >
              View
            </button>

            <button
              disabled={mailPilot.bulkGeneratingFollowUps}
              onClick={() => void mailPilot.generateRepliesForFollowUps()}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium 
        border border-slate-200 text-slate-700 bg-white
        hover:bg-slate-50 hover:border-slate-300
        disabled:opacity-60 disabled:cursor-not-allowed
        transition-all duration-200 flex items-center gap-1.5"
            >
              {mailPilot.bulkGeneratingFollowUps && (
                <span className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              )}
              {mailPilot.bulkGeneratingFollowUps ? "Generating..." : "Auto"}
            </button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {(mailPilot.followUps?.emails ?? []).slice(0, 3).map((e) => (
              <div
                key={e._id}
                className="flex items-start justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="min-w-0 flex-1 break-words text-sm text-slate-700">
                  {e.subject}
                </span>

                <span
                  className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium
            ${e.priority === "high"
                      ? "bg-red-100 text-red-600"
                      : e.priority === "medium"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-slate-100 text-slate-500"
                    }
          `}
                >
                  {e.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reply + Priority */}
        <div className="min-w-0 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Reply Performance
          </h3>

          <p className="text-xs leading-5 text-slate-500">
            Check reply coverage and current priority mix.
          </p>

          {/* Reply Rate */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Reply rate</span>
              <span className="font-semibold text-slate-900">
                {analytics?.replyRate ?? 0}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${analytics?.replyRate ?? 0}%` }}
              />
            </div>
          </div>

          {/* Priority Breakdown */}
          <div className="space-y-2 pt-1">
            {priorityItems.map((item) => (
              <div
                key={item.priority}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  {/* priority indicator */}
                  <span
                    className={`h-2 w-2 rounded-full
              ${item.priority === "high"
                        ? "bg-red-500"
                        : item.priority === "medium"
                          ? "bg-amber-500"
                          : "bg-slate-400"
                      }
            `}
                  />

                  <span className="text-slate-600 capitalize">
                    {item.priority}
                  </span>
                </div>

                <span className="font-medium text-slate-800">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Senders */}
        <div className="min-w-0 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Top Senders
          </h3>

          <p className="text-xs leading-5 text-slate-500">
            See which senders create the most inbox traffic.
          </p>

          {/* List */}
          {topSenders.length ? (
            <div className="space-y-2">
              {topSenders.slice(0, 4).map((s, i) => (
                <div
                  key={s.sender}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {/* Left: rank + avatar + name */}
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    {/* Rank */}
                    <span className="w-4 shrink-0 text-[11px] font-semibold text-slate-400">
                      #{i + 1}
                    </span>

                    {/* Avatar (initial) */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {s.sender?.[0]?.toUpperCase()}
                    </div>

                    {/* Sender */}
                    <span className="truncate text-xs text-slate-700 sm:text-sm">
                      {s.sender}
                    </span>
                  </div>

                  {/* Count */}
                  <span className="shrink-0 text-sm font-semibold text-slate-900">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-2xl mb-1">📭</div>
              <p className="text-sm font-medium text-slate-500">
                No data available
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Sender activity will appear here
              </p>
            </div>
          )}
        </div>

        {/* Recent Emails */}
        <div className="min-w-0 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Recent Conversations
          </h3>
          <p className="text-xs leading-5 text-slate-500">
            Review the latest inbox activity.
          </p>

          {/* List */}
          {mailPilot.recentEmails.length ? (
            <div className="space-y-2">
              {mailPilot.recentEmails.slice(0, 4).map((e) => (
                <div
                  key={e._id}
                  className="flex items-start justify-between gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {/* Left: subject + optional meta */}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-800">
                      {e.subject}
                    </p>

                    {/* optional secondary line if you add sender/time later */}
                    {/* <p className="text-[11px] text-slate-400 mt-0.5">
              John Doe • 2m ago
            </p> */}
                  </div>

                  {/* Priority badge */}
                  <span
                    className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap
              ${e.priority === "high"
                        ? "bg-red-100 text-red-600"
                        : e.priority === "medium"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-slate-100 text-slate-500"
                      }
            `}
                  >
                    {e.priority}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-2xl mb-1">📬</div>
              <p className="text-sm font-medium text-slate-500">
                No recent messages
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Recent activity will appear here
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 🔹 Category + Insights */}
      <section className="grid lg:grid-cols-2 gap-5">

        {/* Categories */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Category Distribution
          </h3>

          {/* List */}
          {categoryItems.length ? (
            <div className="space-y-3">
              {categoryItems.slice(0, 5).map((c, i) => {
                const colors = [
                  "from-blue-500 to-indigo-600",
                  "from-purple-500 to-pink-500",
                  "from-green-500 to-emerald-600",
                  "from-amber-500 to-orange-500",
                  "from-slate-500 to-slate-700",
                ];

                return (
                  <div key={c.category}>
                    {/* Label + % */}
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-600 truncate">
                        {c.category}
                      </span>
                      <span className="font-medium text-slate-900">
                        {c.percentage}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${colors[i % colors.length]} transition-all duration-500`}
                        style={{ width: `${Math.max(10, c.percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-2xl mb-1">📊</div>
              <p className="text-sm font-medium text-slate-500">
                No analytics available
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Categories will appear after sync
              </p>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4">

          {/* Header */}
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Insights
          </h3>

          {/* Insights */}
          {(analytics?.insights ?? []).length ? (
            <div className="space-y-2">
              {(analytics?.insights ?? []).slice(0, 4).map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {/* Indicator */}
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />

                  {/* Text */}
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {i}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-2xl mb-1">🧠</div>
              <p className="text-sm font-medium text-slate-500">
                No insights available
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Insights will appear after more activity
              </p>
            </div>
          )}
        </div>

      </section>

    </div>
  );
}
