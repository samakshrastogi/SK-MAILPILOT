import { useCallback, useEffect, useMemo, useState } from "react";

import { listTeamOverview, updateMailboxAssignments, updateTeamUserRole } from "../api/team";
import { useRealtimeStream } from "../hooks/useRealtimeStream";
import type { TeamMailbox, TeamUser } from "../types/auth";

type TeamPageProps = {
  canManage: boolean;
};

export function TeamPage({ canManage }: TeamPageProps) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [mailboxes, setMailboxes] = useState<TeamMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await listTeamOverview();
      setUsers(response.data.users);
      setMailboxes(response.data.mailboxes);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void loadOverview(true);
  }, [canManage, loadOverview]);

  useRealtimeStream(
    useCallback(
      (event) => {
        if (!canManage) {
          return;
        }
        if (event.event === "audit.updated") {
          void loadOverview();
        }
      },
      [canManage, loadOverview]
    ),
    canManage
  );

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  if (!canManage) {
    return <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">Admin access is required.</section>;
  }

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm sm:p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Team</p>
          <h2 className="truncate text-base font-semibold text-slate-900">Roles and mailbox ownership</h2>
          <p className="mt-1 truncate text-xs text-slate-500">Manage roles, reviewers, and mailbox assignments.</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {loading ? "Updating..." : "Live"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Users</p>
            <h3 className="truncate text-sm font-semibold text-slate-900">Internal roles</h3>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {users.length} users
          </span>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {users.map((user) => (
            <div key={user.id} className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <select
                value={user.role}
                onChange={(event) => void updateTeamUserRole(user.id, event.target.value as TeamUser["role"]).then(() => loadOverview()).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Failed to update role"))}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="member">Member</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Mailboxes</p>
            <h3 className="truncate text-sm font-semibold text-slate-900">Ownership and reviewers</h3>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {mailboxes.length} mailboxes
          </span>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {mailboxes.map((mailbox) => (
            <div key={mailbox.id} className="px-3 py-2.5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{mailbox.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500 capitalize">{mailbox.status}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    value={mailbox.ownerUserId ?? ""}
                    onChange={(event) =>
                      void updateMailboxAssignments(mailbox.id, {
                        ownerUserId: event.target.value,
                        reviewerUserIds: mailbox.reviewerUserIds,
                      }).then(() => loadOverview()).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Failed to update mailbox owner"))
                    }
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
                  >
                    <option value="">Select owner</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                  <select
                    value={mailbox.reviewerUserIds[0] ?? ""}
                    onChange={(event) =>
                      void updateMailboxAssignments(mailbox.id, {
                        ownerUserId: mailbox.ownerUserId ?? users[0]?.id ?? "",
                        reviewerUserIds: event.target.value ? [event.target.value] : [],
                      }).then(() => loadOverview()).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Failed to update reviewers"))
                    }
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
                  >
                    <option value="">No reviewer</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-1.5 truncate text-xs text-slate-500">
                Owner: {mailbox.ownerUserId ? usersById.get(mailbox.ownerUserId)?.name ?? "Unknown" : "Unassigned"}.
                Reviewer: {mailbox.reviewerUserIds[0] ? usersById.get(mailbox.reviewerUserIds[0])?.name ?? "Unknown" : "Not assigned"}.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
