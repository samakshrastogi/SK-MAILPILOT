import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FiEdit2, FiPaperclip, FiSend, FiTrash2, FiZap, FiX } from "react-icons/fi";

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

export function ComposePage({ accounts }: ComposePageProps) {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string>("");
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
  const autosaveTimerRef = useRef<number | null>(null);
  const autosavingRef = useRef(false);

  function resetForm() {
    setEditingId(null);
    setAccountId("");
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
    setTone("professional");
    setAttachments([]);
    setScheduledAt("");
    setRecurrence({ frequency: "none", interval: 1 });
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
      const response = await listScheduledEmails();
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
  }, []);

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
    }, [])
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
    try {
      const payload = {
        name: templateName.trim() || subject.trim(),
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
        <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm transition-all duration-200">

          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">
                Outbox
              </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 tracking-tight">
              Drafts, scheduled sends, and delivery history
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Track drafts, scheduled sends, sent items, and failures.
            </p>
          </div>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              Auto-updating
            </span>
          </div>

          <div className="space-y-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Templates</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">Smart drafts library</h3>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {templates.length}
                </span>
              </div>
              <div className="space-y-2">
                {templates.slice(0, 5).map((template) => (
                  <div key={template._id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <button type="button" onClick={() => applyTemplate(template)} className="w-full text-left">
                      <p className="truncate text-sm font-semibold text-slate-900">{template.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{template.subject}</p>
                    </button>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">{template.tone}</span>
                      <button type="button" onClick={() => void handleDeleteTemplate(template._id)} className="text-rose-600">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!templates.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
                    Save common messages as reusable templates.
                  </div>
                ) : null}
              </div>
            </div>
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading scheduled emails...
              </div>
            ) : scheduledEmails.length ? (
              scheduledEmails.map((item) => {
                const canModify = ["draft", "scheduled", "failed"].includes(item.status);
                const scheduleSummary = formatScheduleSummary(item);

                return (
                  <div
                    key={item._id}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.subject || "Untitled email"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.recipients.join(", ") || "No recipients yet"}
                        </p>
                      </div>

                      <span
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium capitalize ${
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

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {scheduleSummary.scheduleLabel}: {scheduleSummary.scheduleValue}
                      </span>
                      <span>{scheduleSummary.recurrenceLabel}</span>
                    </div>

                    <div className="mt-3 h-px bg-slate-100" />

                    <div className="mt-2 flex justify-end gap-4">
                      {canModify ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 transition-colors"
                          >
                            <FiEdit2 className="text-base" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(item._id)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700 transition-colors"
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No drafts or scheduled emails yet.
              </div>
            )}
          </div>
        </div>

        <div className="order-1 rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm transition-all duration-200 lg:order-2">

          {/* Header */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">
              Compose
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 tracking-tight">
              Compose scheduled and one-time emails
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Drafts autosave while you type, so scheduled emails remain editable before execution.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Add recipients, subject, and message, then send, schedule, or save as a template.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-4">

            {/* Account */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">From</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                title="Select sending account"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">Primary connected mail</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName
                      ? `${account.displayName} (${account.email})`
                      : account.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Recipients */}
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">To</label>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com, another@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Cc</label>
                  <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Bcc</label>
                  <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                </div>
              </div>
            </div>

            {/* Subject + AI */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold text-slate-700">Subject</label>
                <div className="flex items-center gap-2">
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveTemplate()}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700"
                  >
                    Save template
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 transition-all duration-200 hover:border-slate-300 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  onClick={() => void handleSuggestSubjects()}
                  disabled={suggesting || !body.trim()}
                  title="Suggest subject lines based on email body"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <FiZap className="text-sm" />
                  {suggesting ? "Suggesting..." : "Suggest"}
                </button>
              </div>
            </div>

            {/* Suggestions */}
            {subjectSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-sky-50 rounded-xl border border-sky-200">
                <span className="text-xs font-medium text-sky-700 w-full">Suggested subjects:</span>
                {subjectSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubject(item)}
                    className="rounded-full bg-white border border-sky-200 px-3 py-1 text-xs text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-all duration-150 cursor-pointer"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700">Message</label>
                <span className="text-xs text-slate-500">{body.length} characters</span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email message..."
                className="min-h-36 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 resize-none hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            {/* Controls */}
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} title="Email tone" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="short">Short</option>
                  <option value="detailed">Detailed</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Schedule</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} title="Schedule send time" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Leave empty to send now" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Frequency</label>
                <select value={recurrence.frequency} onChange={(e) => setRecurrence((c) => ({ ...c, frequency: e.target.value as typeof c.frequency }))} title="Email recurrence" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
                  <option value="none">One time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            {/* Recurrence Advanced */}
            {recurrence.frequency !== "none" && (
              <div className="grid md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Interval</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recurrence.interval}
                    onChange={(e) => setRecurrence((c) => ({ ...c, interval: Number(e.target.value || 1) }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-white hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all duration-200"
                    placeholder="Interval"
                  />
                </div>

                {recurrence.frequency === "weekly" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Day of Week</label>
                    <select
                      value={recurrence.dayOfWeek ?? 1}
                      onChange={(e) => setRecurrence((c) => ({ ...c, dayOfWeek: Number(e.target.value) }))}
                      title="Select day of week"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-white hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all duration-200"
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                        <option key={d} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}

                {recurrence.frequency === "monthly" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Day of Month</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={recurrence.dayOfMonth ?? 1}
                      onChange={(e) => setRecurrence((c) => ({ ...c, dayOfMonth: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-white hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition-all duration-200"
                      placeholder="Day of month"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Attachments */}
            <div>
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 hover:border-sky-400 hover:bg-sky-50 cursor-pointer transition-all duration-200">
                <FiPaperclip className="text-xl text-slate-400" />
                <div className="text-center">
                  <p className="font-medium text-slate-700">Add attachments</p>
                  <p className="text-xs text-slate-500 mt-1">Click or drag files here</p>
                </div>
                <input type="file" multiple className="hidden" onChange={(e) => void handleFileChange(e)} />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Attachments ({attachments.length})</p>
                {attachments.map((a, i) => (
                  <div key={`${a.filename}-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100 transition-colors duration-150">
                    <span className="truncate text-slate-700">
                      {a.filename} <span className="text-xs text-slate-500">({Math.round(a.size / 1024)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((cur) => cur.filter((_, idx) => idx !== i))}
                      title="Remove attachment"
                      className="text-slate-400 hover:text-rose-500 transition-colors duration-150"
                    >
                      <FiX className="text-lg" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-sky-600 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-all duration-150"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
