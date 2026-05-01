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
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white/90 backdrop-blur-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">

        {/* Left */}
        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">
            Requests
          </p>

          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
              {requests.length}
            </h2>
            <span className="text-sm text-slate-500 font-medium">
              requests
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Approve verified mailboxes and reject incorrect or duplicate requests.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Auto-updating"}
        </span>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Pending</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{pendingRequests.length}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Approved</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{approvedRequests.length}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Audit trail</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{approvedRequests.filter((request) => request.approvedByEmail).length}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white/90 backdrop-blur-xl p-4 shadow-sm hover:shadow-md transition-all duration-200">

        {requests.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">

              {/* Header */}
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Requested Mail</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Approved By</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
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
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
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
                    <td className="px-4 py-4 text-slate-700 truncate">
                      {request.requestedAccountEmail}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize
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

                    <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                      {request.approvedByEmail ?? "Pending"}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                      {new Date(request.approvedAt ?? request.createdAt).toLocaleString()}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-4 text-right">
                      {request.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={approvingId === request.id}
                            onClick={() => void handleApprove(request.id)}
                            className="inline-flex items-center gap-2 rounded-lg 
                        bg-emerald-600 px-3 py-2 text-xs font-semibold text-white
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
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition-all duration-200 disabled:opacity-60"
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

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="px-2 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Audit</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Approval audit trail</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Review who approved each mailbox and when.
          </p>
        </div>
        {approvedRequests.length ? (
          <div className="space-y-3">
            {approvedRequests.map((request) => (
              <div key={`${request.id}-audit`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{request.requestedAccountEmail}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Approved by {request.approvedByEmail ?? "Unknown"} for {request.requesterName}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {request.approvedAt ? new Date(request.approvedAt).toLocaleString() : "Approval time unavailable"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-2 py-8 text-sm text-slate-500">Approved requests will appear here.</div>
        )}
      </section>
    </div>
  );
}
