import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type { TeamMailbox, TeamUser } from "../types/auth";

export async function listTeamOverview() {
  return request<ApiEnvelope<{ users: TeamUser[]; mailboxes: TeamMailbox[] }>>("/api/team");
}

export async function updateTeamUserRole(id: string, role: TeamUser["role"]) {
  return request<ApiEnvelope<{ id: string; role: TeamUser["role"] }>>(`/api/team/users/${id}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function updateMailboxAssignments(
  id: string,
  payload: { ownerUserId: string; reviewerUserIds: string[] }
) {
  return request<ApiEnvelope<{ id: string; ownerUserId: string | null; reviewerUserIds: string[] }>>(
    `/api/team/mailboxes/${id}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}
