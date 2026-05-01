import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { FiSend, FiX } from "react-icons/fi";

import { createReplyTemplate, listReplyTemplates } from "../api/compose";
import type { ComposeAttachmentInput, ProcessedEmail, ReplyTone } from "../types/email";
import type { ReplyTemplate } from "../types/email";
import { getCategoryLabel } from "../utils/emailCategory";

type EmailModalProps = {
  email: ProcessedEmail | null;
  onClose: () => void;
  onGenerateReply: (id: number, style: ReplyTone) => Promise<ProcessedEmail | null>;
  onSendReplyNow: (
    id: number,
    reply?: string,
    style?: ReplyTone,
    attachments?: ComposeAttachmentInput[]
  ) => Promise<ProcessedEmail | null>;
  onScheduleReply: (
    id: number,
    payload: { reply?: string; sendAt: string; style?: ReplyTone; attachments?: ComposeAttachmentInput[] }
  ) => Promise<ProcessedEmail | null>;
  replying: boolean;
  generating: boolean;
};

function tomorrowMorning() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

async function fileToAttachment(file: File): Promise<ComposeAttachmentInput> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
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

export function EmailModal({
  email,
  onClose,
  onGenerateReply,
  onSendReplyNow,
  onScheduleReply,
  replying,
  generating,
}: EmailModalProps) {
  const [replyDraft, setReplyDraft] = useState(email?.reply ?? "");
  const [customDateTime, setCustomDateTime] = useState("");
  const [replyTone, setReplyTone] = useState<ReplyTone>(email?.replyTone ?? "professional");
  const [replyAttachments, setReplyAttachments] = useState<ComposeAttachmentInput[]>([]);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);

  useEffect(() => {
    void listReplyTemplates()
      .then((response) => setTemplates(response.data))
      .catch(() => setTemplates([]));
  }, [email?._id]);

  async function handleReplyFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const nextAttachments = await Promise.all(files.map(fileToAttachment));
    setReplyAttachments((current) => [...current, ...nextAttachments]);
    event.target.value = "";
  }

  if (!email) return null;

  const htmlDocument =
    email.htmlContent ?? "<html><body>No email body available.</body></html>";

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-7xl h-[85vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* 🔹 Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="text-xs text-gray-500">Email #{email.numericId}</p>
            <h2 className="text-base font-semibold">{email.subject}</h2>
            <p className="text-xs text-gray-500">{email.sender}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* 🔹 Split Layout */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT */}
          <div className="w-1/2 border-r overflow-auto p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Original Email
            </h3>

            <div className="border rounded-lg overflow-hidden">
              <iframe
                sandbox=""
                srcDoc={htmlDocument}
                className="w-full h-[60vh]"
                title={`email-${email.numericId}`}
              />
            </div>
          </div>

          {/* RIGHT */}
          <div className="w-1/2 overflow-auto p-4 space-y-4">
            
            {/* 🔹 Reply Section */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Reply</h3>

              <div className="flex gap-1.5">
                <select
                  value={replyTone}
                  onChange={(e) =>
                    setReplyTone(e.target.value as ReplyTone)
                  }
                  className="border rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="short">Short</option>
                  <option value="detailed">Detailed</option>
                </select>

                <button
                  disabled={generating}
                  onClick={async () => {
                    const updated = await onGenerateReply(
                      email.numericId,
                      replyTone
                    );
                    if (updated?.reply) {
                      setReplyDraft(updated.reply);
                      setReplyTone(updated.replyTone);
                    }
                  }}
                  className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs"
                >
                  {generating ? "Generating..." : "AI Generate"}
                </button>
                <select
                  title="Apply reply template"
                  className="border rounded-lg px-2.5 py-1.5 text-xs"
                  onChange={(e) => {
                    const template = templates.find((item) => item._id === e.target.value);
                    if (!template) {
                      return;
                    }
                    setReplyDraft(template.body);
                    setReplyTone(template.tone as ReplyTone);
                  }}
                  defaultValue=""
                >
                  <option value="">Templates</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void createReplyTemplate({
                      name: email.subject,
                      subject: `Re: ${email.subject}`,
                      body: replyDraft,
                      tone: replyTone,
                      category: email.category,
                      sender: email.sender,
                      intent: "reply",
                    }).then(async () => {
                      const response = await listReplyTemplates();
                      setTemplates(response.data);
                    })
                  }
                  className="px-3 py-1.5 border rounded-lg text-xs whitespace-nowrap"
                >
                  Save template
                </button>
              </div>

              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                className="w-full min-h-[100px] border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />

              {/* Actions & Schedule */}
              <div className="flex gap-1.5 items-center">
                <button
                  disabled={replying}
                  onClick={() =>
                    void onSendReplyNow(email.numericId, replyDraft, replyTone, replyAttachments)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs whitespace-nowrap"
                >
                  <FiSend size={14} />
                  {replying ? "Sending..." : "Send"}
                </button>

                <button
                  disabled={replying}
                  onClick={() =>
                    void onScheduleReply(email.numericId, {
                      reply: replyDraft,
                      style: replyTone,
                      attachments: replyAttachments,
                      sendAt: new Date(Date.now() + 3600000).toISOString(),
                    })
                  }
                  className="px-3 py-1.5 border rounded-lg text-xs whitespace-nowrap"
                >
                  1 hour
                </button>

                <button
                  disabled={replying}
                  onClick={() =>
                    void onScheduleReply(email.numericId, {
                      reply: replyDraft,
                      style: replyTone,
                      attachments: replyAttachments,
                      sendAt: tomorrowMorning().toISOString(),
                    })
                  }
                  className="px-3 py-1.5 border rounded-lg text-xs whitespace-nowrap"
                >
                  Tomorrow
                </button>

                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="border rounded-lg px-2.5 py-1.5 text-xs flex-1"
                  title="Select custom schedule time"
                />

                <button
                  disabled={!customDateTime || replying}
                  onClick={() =>
                    void onScheduleReply(email.numericId, {
                      reply: replyDraft,
                      style: replyTone,
                      attachments: replyAttachments,
                      sendAt: new Date(customDateTime).toISOString(),
                    })
                  }
                  className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs whitespace-nowrap"
                >
                  Schedule
                </button>
              </div>

              <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                Add reply attachments
                <input type="file" multiple className="hidden" onChange={(event) => void handleReplyFileChange(event)} />
              </label>

              {replyAttachments.length ? (
                <div className="space-y-1">
                  {replyAttachments.map((attachment, index) => (
                    <div key={`${attachment.filename}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span>{attachment.filename}</span>
                      <button type="button" onClick={() => setReplyAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {/* 🔹 Reply Metadata */}
            <section className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
              <div>
                <p className="text-gray-400 text-xs">Reply tone</p>
                <p className="text-xs font-medium">{email.replyTone}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Status</p>
                <p className="text-xs font-medium">{email.replyStatus}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Reply due</p>
                <p className="text-xs font-medium">
                  {email.replyDueAt ? new Date(email.replyDueAt).toLocaleString() : "No SLA"}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Risk</p>
                <p className="text-xs font-medium capitalize">{email.replyRiskStatus}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Scheduled</p>
                <p className="text-xs font-medium">
                  {email.scheduledReplyAt
                    ? new Date(email.scheduledReplyAt).toLocaleString()
                    : "Not scheduled"}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Sent</p>
                <p className="text-xs font-medium">
                  {email.replySentAt
                    ? new Date(email.replySentAt).toLocaleString()
                    : "Not sent"}
                </p>
              </div>
              {email.replyError && (
                <div className="col-span-2 text-red-500 text-xs">
                  {email.replyError}
                </div>
              )}
            </section>

            {/* 🔹 Metadata */}
            <section className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
              <div>
                <p className="text-gray-400 text-xs">Category</p>
                <p className="text-xs font-medium">{getCategoryLabel(email.category)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Priority</p>
                <p className="text-xs font-medium">{email.priority}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Status</p>
                <p className="text-xs font-medium">{email.status}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Follow-up</p>
                <p className="text-xs font-medium">{email.followUpPending ? "Pending" : "None"}</p>
              </div>
            </section>

            {/* 🔹 Automation */}
            {email.automationActions?.length && (
              <section className="border-t pt-3">
                <h3 className="text-xs font-semibold text-gray-800 mb-2">Automation</h3>
                <div className="flex flex-wrap gap-1">
                  {email.automationActions.map((a) => (
                    <span key={a} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {a}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* 🔹 Attachments */}
            {email.attachments?.length && (
              <section className="border-t pt-3">
                <h3 className="text-xs font-semibold text-gray-800 mb-2">Attachments</h3>

                <div className="grid gap-2">
                  {email.attachments.map((att) => (
                    <div
                      key={att.filename}
                      className="border rounded-lg p-2 space-y-1"
                    >
                      <div className="flex justify-between">
                        <div>
                          <p className="text-xs font-medium">{att.filename}</p>
                          <p className="text-xs text-gray-500">{att.mimeType}</p>
                        </div>
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {Math.round(att.size / 1024)} KB
                        </span>
                      </div>

                      {att.summary && (
                        <p className="text-xs text-gray-600">
                          {att.summary}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          {att.documentType}
                        </span>
                        {att.keyData.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {item}
                          </span>
                        ))}
                      </div>

                      {att.extractedFields.length ? (
                        <div className="grid gap-1 rounded-lg bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                          {att.extractedFields.map((field) => (
                            <div key={`${att.filename}-${field.label}`} className="flex items-start justify-between gap-3">
                              <span className="font-medium text-slate-500">{field.label}</span>
                              <span className="text-right text-slate-700">{field.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {att.previewUrl && (
                        <a
                          href={att.previewUrl}
                          target="_blank"
                          className="text-blue-600 text-xs"
                        >
                          Preview
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
