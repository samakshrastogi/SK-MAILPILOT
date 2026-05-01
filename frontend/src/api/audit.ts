import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type { AuditCenterData } from "../types/email";

export async function getAuditCenter() {
  return request<ApiEnvelope<AuditCenterData>>("/api/audit");
}
