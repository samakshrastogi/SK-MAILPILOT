import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FiCalendar, FiEdit2, FiPaperclip, FiSave, FiSend, FiTrash2, FiZap, FiX } from "react-icons/fi";

import {
  createReplyTemplate,
  createScheduledEmail,
  deleteReplyTemplate,
  deleteScheduledEmail,
  listReplyTemplates,
  listScheduledEmails,
  suggestSubjectLines,
  updateReplyTemplate,
  updateScheduledEmail,
} from "../api/compose";
import { useRealtimeStream } from "../hooks/useRealtimeStream";
import type { GmailAccount } from "../types/auth";
import type {
  ComposeAttachmentInput,
  ComposeRecurrence,
  ReplyTemplate,
  ScheduledEmail,
} from "../types/email";

type ComposePageProps = {
  accounts: GmailAccount[];
  selectedAccountId?: string | null;
  includeAllAccounts?: boolean;
};

const COMPOSE_PREFILL_STORAGE_KEY = "sk-mailpilot-compose-prefill";

function splitEmails(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fileToAttachment(file: File): Promise<ComposeAttachmentInput> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

  return {
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataBase64,
  };
}

export function ComposePage({ accounts, selectedAccountId, includeAllAccounts }: ComposePageProps) {
  const defaultAccountId = selectedAccountId ?? accounts[0]?.id ?? "";
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string>(defaultAccountId);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<"professional" | "friendly" | "short" | "detailed" | "formal" | "casual">("professional");
  const [attachments, setAttachments] = useState<ComposeAttachmentInput[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState<ComposeRecurrence>({ frequency: "none", interval: 1 });
  const [templateName, setTemplateName] = useState("");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosavingRef = useRef(false);

  function resetForm() {
    setEditingId(null);
    setAccountId(defaultAccountId);
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
    setTone("professional");
    setAttachments([]);
    setScheduledAt("");
    setRecurrence({ frequency: "none", interval: 1 });
    setScheduleModalOpen(false);
    setAttachmentModalOpen(false);
    setSubjectSuggestions([]);
  }

  function toDatetimeLocal(value?: string | null) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function loadScheduledEmails(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await listScheduledEmails({ accountId: selectedAccountId, includeAllAccounts });
      setScheduledEmails(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load scheduled emails");
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const response = await listReplyTemplates();
      setTemplates(response.data);
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    void loadScheduledEmails(true);
    void loadTemplates();
  }, [selectedAccountId, includeAllAccounts]);

  useEffect(() => {
    if (!editingId) {
      setAccountId(defaultAccountId);
    }
  }, [defaultAccountId, editingId]);

  useEffect(() => {
    const raw = window.localStorage.getItem(COMPOSE_PREFILL_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const prefill = JSON.parse(raw) as { to?: string; subject?: string; body?: string };
      if (prefill.to) {
        setTo(prefill.to);
      }
      if (prefill.subject) {
        setSubject(prefill.subject);
      }
      if (prefill.body) {
        setBody(prefill.body);
      }
    } catch {
      // Ignore malformed prefill payloads.
    } finally {
      window.localStorage.removeItem(COMPOSE_PREFILL_STORAGE_KEY);
    }
  }, []);

  useRealtimeStream(
    useCallback((event) => {
      if (event.event === "compose.updated") {
        void loadScheduledEmails();
      }
    }, [selectedAccountId, includeAllAccounts])
  );

  const hasDraftContent = useMemo(
    () => Boolean(subject.trim() || body.trim() || to.trim() || cc.trim() || bcc.trim() || attachments.length),
    [attachments.length, bcc, body, cc, subject, to]
  );

  const autosavePayload = useMemo(
    () => ({
      accountId: accountId || null,
      recipients: splitEmails(to),
      cc: splitEmails(cc),
      bcc: splitEmails(bcc),
      subject: subject.trim() || "Untitled draft",
      body: body.trim() || "Draft in progress",
      tone,
      attachments,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurrence,
      saveAsDraft: true,
    }),
    [accountId, attachments, bcc, body, cc, recurrence, scheduledAt, subject, to, tone]
  );

  useEffect(() => {
    if (!hasDraftContent || loading || saving) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(async () => {
      if (autosavingRef.current) {
        return;
      }
      autosavingRef.current = true;
      try {
        if (editingId) {
          const response = await updateScheduledEmail(editingId, autosavePayload);
          setScheduledEmails((current) =>
            current.map((item) => (item._id === editingId ? response.data : item))
          );
        } else {
          const response = await createScheduledEmail(autosavePayload);
          if ("_id" in response.data) {
            const createdDraft = response.data;
            setEditingId(createdDraft._id);
            setScheduledEmails((current) => [createdDraft, ...current.filter((item) => item._id !== createdDraft._id)]);
          }
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to autosave draft");
      } finally {
        autosavingRef.current = false;
      }
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [autosavePayload, editingId, hasDraftContent, loading, saving]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const nextAttachments = await Promise.all(files.map(fileToAttachment));
    setAttachments((current) => [...current, ...nextAttachments]);
    event.target.value = "";
  }

  async function handleSave(saveAsDraft: boolean) {
    setSaving(true);
    try {
      const payload = {
        accountId: accountId || null,
        recipients: splitEmails(to),
        cc: splitEmails(cc),
        bcc: splitEmails(bcc),
        subject,
        body,
        tone,
        attachments,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurrence,
        saveAsDraft,
      };

      if (editingId) {
        const response = await updateScheduledEmail(editingId, payload);
        setEditingId(response.data._id);
      } else {
        const response = await createScheduledEmail(payload);
        if ("_id" in response.data) {
          setEditingId(response.data._id);
        }
      }

      await loadScheduledEmails();
      setError(null);
      resetForm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save email");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuggestSubjects() {
    setSuggesting(true);
    try {
      const response = await suggestSubjectLines({
        body,
        recipients: splitEmails(to),
        tone,
      });
      setSubjectSuggestions(response.data.subjects);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to suggest subjects");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteScheduledEmail(id);
      await loadScheduledEmails();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete scheduled email");
    }
  }

  async function handleSaveTemplate() {
    if (!subject.trim() || !body.trim()) {
      setError("Add a subject and message before saving a template");
      return;
    }
    if (!templateName.trim()) {
      setError("Enter a template name before saving");
      return;
    }
    try {
      const payload = {
        name: templateName.trim(),
        subject: subject.trim(),
        body: body.trim(),
        tone,
        category: null,
        sender: null,
        intent: "compose",
      };
      const existing = templates.find((item) => item.name.toLowerCase() === payload.name.toLowerCase());
      if (existing) {
        await updateReplyTemplate(existing._id, payload);
      } else {
        await createReplyTemplate(payload);
      }
      setTemplateName("");
      setTemplateModalOpen(false);
      await loadTemplates();
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save template");
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await deleteReplyTemplate(id);
      await loadTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete template");
    }
  }

  function applyTemplate(template: ReplyTemplate) {
    setSubject(template.subject);
    setBody(template.body);
    setTone(template.tone);
    setTemplateName(template.name);
  }

  function handleEdit(item: ScheduledEmail) {
    if (!["draft", "scheduled", "failed"].includes(item.status)) {
      return;
    }
    setEditingId(item._id);
    setAccountId(item.accountId ?? "");
    setTo(item.recipients.join(", "));
    setCc(item.cc.join(", "));
    setBcc(item.bcc.join(", "));
    setSubject(item.subject);
    setBody(item.body);
    setTone(item.tone);
    setAttachments(item.attachments ?? []);
    setScheduledAt(toDatetimeLocal(item.scheduledAt));
    setRecurrence(item.recurrence ?? { frequency: "none", interval: 1 });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getComposeScheduleSummary() {
    if (recurrence.frequency !== "none") {
      return `${recurrence.frequency} x${recurrence.interval}`;
    }

    if (scheduledAt) {
      return new Date(scheduledAt).toLocaleString();
    }

    return "Send now";
  }

  function formatScheduleSummary(item: ScheduledEmail) {
    const scheduleValue = item.nextRunAt ?? item.scheduledAt ?? item.createdAt;
    const scheduleLabel =
      item.status === "sent"
        ? "Sent"
        : item.status === "failed"
          ? "Last attempt"
          : item.status === "draft"
            ? "Updated"
            : "Scheduled";
    const recurrenceLabel =
      item.recurrence.frequency === "none"
        ? "One time"
        : `${item.recurrence.frequency} x${item.recurrence.interval}`;

    return {
      scheduleLabel,
      scheduleValue: new Date(scheduleValue).toLocaleString(),
      recurrenceLabel,
    };
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[0.36fr,1.64fr]">
        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition-all duration-200 sm:p-4">

          {/* Header */}
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                Outbox
              </p>
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-900">
              Drafts and scheduled emails
            </h2>
          </div>

            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              Live
            </span>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">Templates</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Reusable message drafts</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {templates.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
                {templates.slice(0, 5).map((template) => (
                  <div key={template._id} className="px-2.5 py-2">
                    <button type="button" onClick={() => applyTemplate(template)} className="w-full text-left">
                      <p className="truncate text-sm font-semibold text-slate-900">{template.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{template.subject}</p>
                    </button>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">{template.tone}</span>
                      <button type="button" onClick={() => void handleDeleteTemplate(template._id)} className="text-rose-600">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!templates.length ? (
                  <div className="px-2.5 py-2.5 text-xs text-slate-500">
                    Save common messages as reusable templates.
                  </div>
                ) : null}
              </div>
            </div>
            {loading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                Loading scheduled emails...
              </div>
            ) : scheduledEmails.length ? (
              scheduledEmails.map((item) => {
                const canModify = ["draft", "scheduled", "failed"].includes(item.status);
                const scheduleSummary = formatScheduleSummary(item);

                return (
                  <div
                    key={item._id}
                    className="group rounded-lg border border-slate-200 bg-white p-3 transition-all duration-200 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.subject || "Untitled email"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.recipients.join(", ") || "No recipients yet"}
                        </p>
                      </div>

                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                          item.status === "sent"
                            ? "bg-emerald-100 text-emerald-700"
                            : item.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : item.status === "draft"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-blue-100 text-blue-600"
                        }`}
                      >
                      {item.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {scheduleSummary.scheduleLabel}: {scheduleSummary.scheduleValue}
                      </span>
                      <span>{scheduleSummary.recurrenceLabel}</span>
                    </div>

                    <div className="mt-2 h-px bg-slate-100" />

                    <div className="mt-2 flex justify-end gap-3">
                      {canModify ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 transition-colors hover:text-sky-700"
                          >
                            <FiEdit2 className="text-base" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(item._id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 transition-colors hover:text-rose-700"
                          >
                            <FiTrash2 className="text-base" />
                            Delete
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">
                          Sent emails are locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                No drafts or scheduled emails yet.
              </div>
            )}
          </div>
        </div>

        <div className="order-1 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition-all duration-200 sm:p-4 lg:order-2">

          {/* Header */}
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                Compose
              </p>
              <h2 className="truncate text-base font-semibold tracking-tight text-slate-900">
                Compose email
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setTemplateName((current) => current || subject.trim());
                setTemplateModalOpen(true);
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              <FiSave className="text-sm" />
              Save template
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-2.5">

            {/* Account */}
            <div className="grid gap-2.5 md:grid-cols-[0.72fr,1.28fr]">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">From</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                title="Select sending account"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              >
                {accounts.length ? (
                  accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.email}
                    </option>
                  ))
                ) : (
                  <option value="">No connected mailboxes</option>
                )}
              </select>
            </div>

            {/* Recipients */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">To</label>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com, another@example.com"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

              <div className="grid gap-2.5 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Cc</label>
                  <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Bcc</label>
                  <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                </div>
              </div>

            {/* Subject + AI */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold text-slate-700">Subject</label>
              </div>
              <div className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 py-0.5 transition-all duration-200 hover:border-slate-300 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  onClick={() => void handleSuggestSubjects()}
                  disabled={suggesting || !body.trim()}
                  title="Suggest subject lines based on email body"
                  className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-sky-50 px-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiZap className="text-sm" />
                  {suggesting ? "Suggesting..." : "Suggest"}
                </button>
              </div>
            </div>

            {/* Suggestions */}
            {subjectSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-sky-200 bg-sky-50 p-2">
                <span className="text-xs font-medium text-sky-700 w-full">Suggested subjects:</span>
                {subjectSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubject(item)}
                    className="cursor-pointer rounded-full border border-sky-200 bg-white px-2.5 py-0.5 text-xs text-sky-700 transition-all duration-150 hover:border-sky-300 hover:bg-sky-100"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">Message</label>
                <span className="text-xs text-slate-500">{body.length} characters</span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email message..."
                className="min-h-24 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            {/* Controls */}
            <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} title="Email tone" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="short">Short</option>
                  <option value="detailed">Detailed</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(true)}
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                    scheduledAt || recurrence.frequency !== "none"
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title={`Schedule: ${getComposeScheduleSummary()}`}
                >
                  <FiCalendar />
                  {scheduledAt || recurrence.frequency !== "none" ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setAttachmentModalOpen(true)}
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                    attachments.length
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title={attachments.length ? `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}` : "Attachments"}
                >
                  <FiPaperclip />
                  {attachments.length ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white">
                      {attachments.length}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave(false)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-linear-to-r from-sky-600 to-sky-500 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiSend className="text-base" />
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update email"
                    : scheduledAt || recurrence.frequency !== "none"
                      ? "Schedule email"
                      : "Send now"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-all duration-150 hover:bg-slate-50 active:bg-slate-100"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {scheduleModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Schedule
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Send timing</h3>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                title="Close"
              >
                <FiX />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Schedule</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  title="Schedule send time"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Frequency</span>
                <select
                  value={recurrence.frequency}
                  onChange={(event) =>
                    setRecurrence((current) => ({
                      ...current,
                      frequency: event.target.value as typeof current.frequency,
                    }))
                  }
                  title="Email recurrence"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="none">One time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>

            {recurrence.frequency !== "none" ? (
              <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Interval</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recurrence.interval}
                    onChange={(event) =>
                      setRecurrence((current) => ({ ...current, interval: Number(event.target.value || 1) }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                {recurrence.frequency === "weekly" ? (
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Day of week</span>
                    <select
                      value={recurrence.dayOfWeek ?? 1}
                      onChange={(event) =>
                        setRecurrence((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))
                      }
                      title="Select day of week"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {recurrence.frequency === "monthly" ? (
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Day of month</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={recurrence.dayOfMonth ?? 1}
                      onChange={(event) =>
                        setRecurrence((current) => ({ ...current, dayOfMonth: Number(event.target.value) }))
                      }
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setScheduledAt("");
                  setRecurrence({ frequency: "none", interval: 1 });
                }}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {attachmentModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Attachments
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Files</h3>
              </div>
              <button
                type="button"
                onClick={() => setAttachmentModalOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                title="Close"
              >
                <FiX />
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 transition hover:border-sky-400 hover:bg-sky-50">
              <FiPaperclip className="text-base text-slate-400" />
              <span className="font-medium text-slate-700">Add attachments</span>
              <input type="file" multiple className="hidden" onChange={(event) => void handleFileChange(event)} />
            </label>

            {attachments.length > 0 ? (
              <div className="mt-4 space-y-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.filename}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-slate-700">
                      {attachment.filename}{" "}
                      <span className="text-xs text-slate-500">({Math.round(attachment.size / 1024)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      title="Remove attachment"
                      className="text-slate-400 transition hover:text-rose-500"
                    >
                      <FiX className="text-lg" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                No attachments added.
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAttachmentModalOpen(false)}
                className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {templateModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Template
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Save reusable email</h3>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                title="Close"
              >
                <FiX />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Templates store the current subject, message, and tone so you can reuse common emails later from the Templates list.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Template name</span>
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Follow-up email"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                autoFocus
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTemplate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                <FiSave />
                Save template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
