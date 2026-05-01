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
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Audit</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Audit and compliance</h2>
          <p className="mt-2 text-sm text-slate-500">Central review for syncs, approvals, sent replies, failed sends, and admin actions.</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Open this page when you need a timeline of operational events instead of just the latest UI state.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Live"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Sync runs", value: summary?.syncRuns ?? 0, icon: FiActivity },
          { label: "Pending approvals", value: summary?.pendingApprovals ?? 0, icon: FiClock },
          { label: "Sent replies", value: summary?.sentReplies ?? 0, icon: FiCheckCircle },
          { label: "Failed sends", value: summary?.failedSends ?? 0, icon: FiAlertCircle },
          { label: "Live mailboxes", value: summary?.mailboxes ?? 0, icon: FiShield },
        ].map((item) => (
          <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <item.icon className="text-slate-400" />
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="px-2 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Timeline</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Recent activity</h3>
        </div>
        {data?.events.length ? (
          <div className="space-y-3">
            {data.events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${event.status === "success" ? "bg-emerald-50 text-emerald-700" : event.status === "error" ? "bg-rose-50 text-rose-700" : event.status === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{event.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{event.kind}</p>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
                {event.details ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">{JSON.stringify(event.details, null, 2)}</pre>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="px-2 py-8 text-sm text-slate-500">Audit activity will appear here.</div>
        )}
      </section>
    </div>
  );
}
