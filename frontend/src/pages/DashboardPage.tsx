import { useEffect, useState } from "react";

import { listSyncHistory } from "../api/email";
import { StatCard } from "../components/StatCard";
import type { useMailPilotData } from "../hooks/useMailPilotData";
import type { SyncHistoryEntry } from "../types/email";
type DashboardPageProps = {
  mailPilot: ReturnType<typeof useMailPilotData>;
  accountId?: string | null;
  includeAllAccounts?: boolean;
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

export function DashboardPage({ mailPilot, accountId, includeAllAccounts }: DashboardPageProps) {
  const [, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const analytics = mailPilot.analytics;
  const priorityItems = analytics?.priorityBreakdown ?? [];
  const topSenders = analytics?.topSenders ?? [];
  const categoryItems = analytics?.categoryDistribution ?? [];
  const pendingReplyCount = mailPilot.followUps?.count ?? mailPilot.stats?.remainingEmails ?? 0;
  const overdueReplyCount = mailPilot.followUps?.overdueCount ?? 0;
  const atRiskReplyCount = mailPilot.followUps?.atRiskCount ?? 0;
  const replyLabel = pendingReplyCount === 1 ? "reply" : "replies";
  const overdueReplyLabel = overdueReplyCount === 1 ? "reply" : "replies";
  const atRiskReplyLabel = atRiskReplyCount === 1 ? "reply" : "replies";
  const pendingReplyHelper =
    overdueReplyCount > 0
      ? `${overdueReplyCount} overdue`
      : atRiskReplyCount > 0
        ? `${atRiskReplyCount} due soon`
        : pendingReplyCount > 0
          ? "Awaiting response"
          : "No replies due";
  const pendingReplyStatus =
    overdueReplyCount > 0
      ? `${overdueReplyCount} overdue ${overdueReplyLabel}`
      : atRiskReplyCount > 0
        ? `${atRiskReplyCount} ${atRiskReplyLabel} due soon`
        : pendingReplyCount > 0
          ? `${pendingReplyCount} open ${replyLabel}`
          : "No replies due";

  useEffect(() => {
    let cancelled = false;

    async function loadSyncHistory() {
      try {
        const response = await listSyncHistory(4, { accountId, includeAllAccounts });
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
  }, [accountId, includeAllAccounts, mailPilot.lastSyncAt]);

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* 🔹 Header */}
      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-3 shadow-[0_16px_42px_-36px_rgba(14,116,144,0.45)] transition-all duration-200 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                Overview
              </p>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-sky-100">
                Last sync {formatDuration(mailPilot.lastSyncDurationMs ?? 0)}
              </span>
              {mailPilot.lastSyncAt ? (
                <span className="rounded-full bg-slate-100/90 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {new Date(mailPilot.lastSyncAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-2xl truncate text-xs leading-5 text-slate-600 sm:text-sm">
              Start here to review inbox health, pending replies, and recent activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/sender-insights";
              }}
              className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
            >
              Insights
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/sync-history";
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Sync History
            </button>
          </div>
        </div>
      </section>

      {/* 🔹 Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Inbox emails"
          value={mailPilot.stats?.totalEmails ?? 0}
          helper="Active messages"
        />
        <StatCard
          label="Processed emails"
          value={mailPilot.stats?.processedEmails ?? 0}
          helper="Ready to review"
        />
        <StatCard
          label="Replies needed"
          value={pendingReplyCount}
          tone="alert"
          helper={pendingReplyHelper}
          onClick={openPendingInbox}
        />
        <StatCard label="Last 24 hours" value={analytics?.totals.daily ?? 0} helper="Received" />
        <StatCard label="Last 7 days" value={analytics?.totals.weekly ?? 0} helper="Received" />
        <StatCard label="Last 30 days" value={analytics?.totals.monthly ?? 0} helper="Received" />
      </section>

      {/* 🔹 Main Grid */}
      <section className="grid gap-4 lg:grid-cols-2">

        {/* Follow-ups */}
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Replies needing action
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {pendingReplyStatus}
              </p>
            </div>

            {/* optional subtle indicator */}
            {pendingReplyCount > 0 && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {pendingReplyCount} open
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openPendingInbox}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            >
              Open queue
            </button>

            <button
              type="button"
              disabled={mailPilot.bulkGeneratingFollowUps}
              onClick={() => void mailPilot.generateRepliesForFollowUps()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mailPilot.bulkGeneratingFollowUps && (
                <span className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              )}
              {mailPilot.bulkGeneratingFollowUps ? "Drafting..." : "Draft replies"}
            </button>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {(mailPilot.followUps?.emails ?? []).slice(0, 3).map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
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
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              Reply coverage and priority mix
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Sent replies vs. active inbox priority.
            </p>
          </div>

          {/* Reply Rate */}
          <div className="space-y-1.5">
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
          <div className="grid gap-1.5 pt-1">
            {priorityItems.map((item) => (
              <div
                key={item.priority}
                className="flex items-center justify-between rounded-lg px-1.5 py-1 text-sm"
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
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Highest-volume senders
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Senders with the most active emails.
              </p>
            </div>
            {topSenders.length ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Top {Math.min(topSenders.length, 4)}
              </span>
            ) : null}
          </div>

          {/* List */}
          {topSenders.length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
              {topSenders.slice(0, 4).map((s, i) => (
                <div
                  key={s.sender}
                  className="flex items-center justify-between gap-3 px-2.5 py-2 transition-colors hover:bg-slate-50"
                >
                  {/* Left: rank + avatar + name */}
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {/* Rank */}
                    <span className="w-4 shrink-0 text-[10px] font-semibold text-slate-400">
                      #{i + 1}
                    </span>

                    {/* Avatar (initial) */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">
                      {s.sender?.[0]?.toUpperCase()}
                    </div>

                    {/* Sender */}
                    <span className="truncate text-sm text-slate-700">
                      {s.sender}
                    </span>
                  </div>

                  {/* Count */}
                  <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-900">
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
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Latest inbox messages
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Newest active emails by received time.
              </p>
            </div>
            {mailPilot.recentEmails.length ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {Math.min(mailPilot.recentEmails.length, 4)} shown
              </span>
            ) : null}
          </div>

          {/* List */}
          {mailPilot.recentEmails.length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
              {mailPilot.recentEmails.slice(0, 4).map((e) => (
                <div
                  key={e._id}
                  className="flex items-center justify-between gap-3 px-2.5 py-2 transition-colors hover:bg-slate-50"
                >
                  {/* Left: subject + optional meta */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
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
      <section className="grid gap-4 lg:grid-cols-2">

        {/* Categories */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Email categories
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Share of active inbox by category.
              </p>
            </div>
            {categoryItems.length ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Top {Math.min(categoryItems.length, 5)}
              </span>
            ) : null}
          </div>

          {/* List */}
          {categoryItems.length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
              {categoryItems.slice(0, 5).map((c, i) => {
                const colors = [
                  "from-blue-500 to-indigo-600",
                  "from-purple-500 to-pink-500",
                  "from-green-500 to-emerald-600",
                  "from-amber-500 to-orange-500",
                  "from-slate-500 to-slate-700",
                ];

                return (
                  <div key={c.category} className="grid gap-1.5 px-2.5 py-2">
                    {/* Label + % */}
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-700">
                        {c.category}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-slate-900">
                        {c.percentage}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
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
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Inbox insights
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Notable patterns from current email data.
              </p>
            </div>
            {(analytics?.insights ?? []).length ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {Math.min((analytics?.insights ?? []).length, 4)} notes
              </span>
            ) : null}
          </div>

          {/* Insights */}
          {(analytics?.insights ?? []).length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
              {(analytics?.insights ?? []).slice(0, 4).map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 px-2.5 py-2 transition-colors hover:bg-slate-50"
                >
                  {/* Indicator */}
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />

                  {/* Text */}
                  <p className="text-sm leading-5 text-slate-700">
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
