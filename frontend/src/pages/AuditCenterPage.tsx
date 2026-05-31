import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiAlertCircle, FiCheckCircle, FiClock, FiShield } from "react-icons/fi";

import { getAuditCenter } from "../api/audit";
import { useRealtimeStream } from "../hooks/useRealtimeStream";
import type { AuditCenterData } from "../types/email";

type AuditCenterPageProps = {
  canView: boolean;
};

export function AuditCenterPage({ canView }: AuditCenterPageProps) {
  const [data, setData] = useState<AuditCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditCenter = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await getAuditCenter();
      setData(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load audit center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void loadAuditCenter(true);
  }, [canView, loadAuditCenter]);

  useRealtimeStream(
    useCallback(
      (event) => {
        if (!canView) {
          return;
        }
        if (event.event === "audit.updated" || event.event === "notification.created") {
          void loadAuditCenter();
        }
      },
      [canView, loadAuditCenter]
    ),
    canView
  );

  if (!canView) {
    return <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">Reviewer or admin access is required.</section>;
  }

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm sm:p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Audit</p>
          <h2 className="truncate text-base font-semibold text-slate-900">Audit and compliance</h2>
          <p className="mt-1 truncate text-xs text-slate-500">Operational events, approvals, sends, and admin actions.</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {loading ? "Updating..." : "Live"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Sync runs", value: summary?.syncRuns ?? 0, icon: FiActivity },
          { label: "Pending approvals", value: summary?.pendingApprovals ?? 0, icon: FiClock },
          { label: "Sent replies", value: summary?.sentReplies ?? 0, icon: FiCheckCircle },
          { label: "Failed sends", value: summary?.failedSends ?? 0, icon: FiAlertCircle },
          { label: "Live mailboxes", value: summary?.mailboxes ?? 0, icon: FiShield },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-2xl font-semibold leading-none text-slate-900">{item.value}</p>
              </div>
              <item.icon className="shrink-0 text-sm text-slate-400" />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-1.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">Timeline</p>
            <h3 className="text-sm font-semibold text-slate-900">Recent activity</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{data?.events.length ?? 0} events</span>
        </div>
        {data?.events.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {data.events.map((event) => (
              <article key={event.id} className="grid gap-1 px-2.5 py-1.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize leading-4 ${event.status === "success" ? "bg-emerald-50 text-emerald-700" : event.status === "error" ? "bg-rose-50 text-rose-700" : event.status === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{event.status}</span>
                    <p className="truncate text-sm font-semibold leading-5 text-slate-900">{event.title}</p>
                    <span className="hidden shrink-0 text-xs text-slate-300 md:inline">/</span>
                    <p className="hidden truncate text-xs text-slate-500 md:block">{event.kind}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 md:hidden">{event.kind}</p>
                </div>
                <time className="text-xs text-slate-400 md:text-right" dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-2 py-5 text-sm text-slate-500">Audit activity will appear here.</div>
        )}
      </section>
    </div>
  );
}
