import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiInbox } from "react-icons/fi";

import {
  approveMailAccessRequest,
  listMailAccessRequests,
  rejectMailAccessRequest,
} from "../api/mail-access";
import { useRealtimeStream } from "../hooks/useRealtimeStream";
import type { MailAccessRequest } from "../types/auth";

type MailAccessRequestsPageProps = {
  canView: boolean;
};

export function MailAccessRequestsPage({ canView }: MailAccessRequestsPageProps) {
  const [requests, setRequests] = useState<MailAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const pendingRequests = requests.filter((request) => request.status === "pending");

  async function loadRequests(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await listMailAccessRequests();
      setRequests(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await approveMailAccessRequest(id);
      await loadRequests();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to approve request");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id: string) {
    setRejectingId(id);
    try {
      await rejectMailAccessRequest(id);
      await loadRequests();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to reject request");
    } finally {
      setRejectingId(null);
    }
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    void loadRequests(true);
  }, [canView]);

  useRealtimeStream(
    useCallback((event) => {
      if (!canView) {
        return;
      }
      if (event.event === "notification.created" || event.event === "audit.updated") {
        void loadRequests();
      }
    }, [canView]),
    canView
  );

  if (!canView) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Admin access is required.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md sm:p-4">

        {/* Left */}
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">
            Requests
          </p>

          <div className="mt-0.5 flex items-baseline gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {requests.length}
            </h2>
            <span className="text-xs font-medium text-slate-500">
              requests
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            Review mailbox access approvals.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {loading ? "Updating..." : "Live"}
        </span>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-slate-900">{pendingRequests.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-slate-900">{approvedRequests.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Audit trail</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-slate-900">{approvedRequests.filter((request) => request.approvedByEmail).length}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md">

        {requests.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">

              {/* Header */}
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Requester</th>
                  <th className="px-3 py-2 font-medium">Requested Mail</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Approved By</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    {/* Requester */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {/* Avatar */}
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {request.requesterName?.[0]}
                        </div>

                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {request.requesterName}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {request.loginEmail}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Requested Mail */}
                    <td className="truncate px-3 py-2.5 text-slate-700">
                      {request.requestedAccountEmail}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize
                    ${request.status === "approved"
                            ? "bg-green-100 text-green-600"
                            : request.status === "pending"
                              ? "bg-amber-100 text-amber-600"
                              : "bg-slate-100 text-slate-500"
                          }
                  `}
                      >
                        {request.status}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                      {request.approvedByEmail ?? "Pending"}
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                      {new Date(request.approvedAt ?? request.createdAt).toLocaleString()}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2.5 text-right">
                      {request.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={approvingId === request.id}
                            onClick={() => void handleApprove(request.id)}
                            className="inline-flex items-center gap-2 rounded-lg 
                        bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white
                        hover:bg-emerald-700 active:scale-[0.98]
                        transition-all duration-200 disabled:opacity-60"
                          >
                            <FiCheck className="text-sm" />
                            {approvingId === request.id ? "Approving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={rejectingId === request.id}
                            onClick={() => void handleReject(request.id)}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-all duration-200 disabled:opacity-60"
                          >
                            {rejectingId === request.id ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {request.status === "approved"
                            ? "Approved"
                            : "Waiting for approval"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FiInbox className="text-3xl text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
              No requests
              </p>
              <p className="text-xs text-slate-400">
              New requests will appear here
              </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Audit</p>
            <h3 className="truncate text-base font-semibold text-slate-900">Approval audit trail</h3>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {approvedRequests.length} entries
          </span>
        </div>
        {approvedRequests.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {approvedRequests.map((request) => (
              <div key={`${request.id}-audit`} className="grid gap-1.5 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{request.requestedAccountEmail}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {request.approvedByEmail ?? "Unknown"} approved for {request.requesterName}
                  </p>
                </div>
                <time className="text-xs text-slate-500 md:text-right" dateTime={request.approvedAt ?? request.createdAt}>
                  {request.approvedAt ? new Date(request.approvedAt).toLocaleString() : "Approval time unavailable"}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-2 py-4 text-sm text-slate-500">Approved requests will appear here.</div>
        )}
      </section>
    </div>
  );
}
