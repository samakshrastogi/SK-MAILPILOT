import type { ApiEnvelope } from "./client";
import { request } from "./client";
import type {
  ComposeAttachmentInput,
  ComposeRecurrence,
  ReplyTemplate,
  ScheduledEmail,
} from "../types/email";

export async function listScheduledEmails() {
  return request<ApiEnvelope<ScheduledEmail[]>>("/api/compose");
}

export async function createScheduledEmail(payload: {
  accountId?: string | null;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string | null;
  tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
  attachments?: ComposeAttachmentInput[];
  scheduledAt?: string | null;
  timezone: string;
  recurrence: ComposeRecurrence;
  saveAsDraft?: boolean;
}) {
  return request<ApiEnvelope<ScheduledEmail | { status: string }>>("/api/compose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateScheduledEmail(
  id: string,
  payload: {
    accountId?: string | null;
    recipients: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    htmlBody?: string | null;
    tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
    attachments?: ComposeAttachmentInput[];
    scheduledAt?: string | null;
    timezone: string;
    recurrence: ComposeRecurrence;
    saveAsDraft?: boolean;
  }
) {
  return request<ApiEnvelope<ScheduledEmail>>(`/api/compose/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteScheduledEmail(id: string) {
  return request<ApiEnvelope<{ id: string; status: string }>>(`/api/compose/${id}`, {
    method: "DELETE",
  });
}

export async function suggestSubjectLines(payload: {
  body: string;
  recipients?: string[];
  tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
}) {
  return request<ApiEnvelope<{ subjects: string[] }>>("/api/compose/suggest-subjects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listReplyTemplates() {
  return request<ApiEnvelope<ReplyTemplate[]>>("/api/compose/templates");
}

export async function createReplyTemplate(payload: {
  name: string;
  subject: string;
  body: string;
  tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
  category?: string | null;
  sender?: string | null;
  intent?: string | null;
}) {
  return request<ApiEnvelope<ReplyTemplate>>("/api/compose/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateReplyTemplate(
  id: string,
  payload: {
    name: string;
    subject: string;
    body: string;
    tone: "professional" | "friendly" | "short" | "detailed" | "formal" | "casual";
    category?: string | null;
    sender?: string | null;
    intent?: string | null;
  }
) {
  return request<ApiEnvelope<ReplyTemplate>>(`/api/compose/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteReplyTemplate(id: string) {
  return request<ApiEnvelope<{ id: string }>>(`/api/compose/templates/${id}`, {
    method: "DELETE",
  });
}
