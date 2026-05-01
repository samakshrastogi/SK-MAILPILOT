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
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Team</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Roles and mailbox ownership</h2>
          <p className="mt-2 text-sm text-slate-500">Manage internal roles, reviewers, and mailbox ownership assignments.</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Control who manages the system and who owns each mailbox.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Live"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="px-2 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Users</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Internal roles</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Members work inboxes, reviewers monitor, and admins manage access.
          </p>
        </div>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="mt-1 text-xs text-slate-500">{user.email}</p>
              </div>
              <select
                value={user.role}
                onChange={(event) => void updateTeamUserRole(user.id, event.target.value as TeamUser["role"]).then(() => loadOverview()).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Failed to update role"))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="px-2 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Mailboxes</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Ownership and reviewers</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Assign a primary owner and optional reviewer for each mailbox.
          </p>
        </div>
        <div className="space-y-3">
          {mailboxes.map((mailbox) => (
            <div key={mailbox.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{mailbox.email}</p>
                  <p className="mt-1 text-xs text-slate-500 capitalize">{mailbox.status}</p>
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
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">No reviewer</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
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
