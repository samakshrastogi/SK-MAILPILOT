import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { FiSend, FiX } from "react-icons/fi";

import type { ComposeAttachmentInput, ProcessedEmail, ReplyTone } from "../types/email";

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

function makeResponsiveEmailHtml(html: string) {
  const responsiveStyles = `
    <style>
      html, body { margin: 0; max-width: 100%; overflow-x: hidden; }
      body {
        box-sizing: border-box;
        padding: 12px;
        color: #0f172a;
        font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      *, *::before, *::after { box-sizing: border-box; max-width: 100% !important; }
      img, video, canvas, svg { height: auto !important; }
      table { width: 100% !important; table-layout: auto; }
      pre { white-space: pre-wrap; }
    </style>
  `;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${responsiveStyles}</head>`);
  }

  return `<!doctype html><html><head>${responsiveStyles}</head><body>${html}</body></html>`;
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
  const [replyOpen, setReplyOpen] = useState(false);

  useEffect(() => {
    setReplyOpen(false);
    setReplyDraft(email?.reply ?? "");
  }, [email?._id]);

  async function handleReplyFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const nextAttachments = await Promise.all(files.map(fileToAttachment));
    setReplyAttachments((current) => [...current, ...nextAttachments]);
    event.target.value = "";
  }

  if (!email) return null;

  const htmlDocument = makeResponsiveEmailHtml(
    email.htmlContent ?? "<html><body>No email body available.</body></html>"
  );

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:h-[88vh]"
      >
        {/* 🔹 Header */}
        <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Email #{email.numericId}</p>
            <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900 sm:text-base">{email.subject}</h2>
            <p className="truncate text-xs text-gray-500">{email.sender}</p>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 hover:bg-gray-100"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* 🔹 Split Layout */}
        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          
          {/* LEFT */}
          <div className="space-y-2 border-b p-3 md:w-1/2 md:overflow-auto md:border-b-0 md:border-r md:p-4">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Original Email
            </h3>

            <div className="overflow-hidden rounded-lg border">
              <iframe
                sandbox=""
                srcDoc={htmlDocument}
                className="h-[34vh] w-full md:h-[60vh]"
                title={`email-${email.numericId}`}
              />
            </div>
          </div>

          {/* RIGHT */}
          <div className="p-3 md:w-1/2 md:overflow-auto md:p-4">
            {!replyOpen ? (
              <button type="button" onClick={() => setReplyOpen(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white sm:w-auto"><FiSend /> Reply</button>
            ) : (
              <section className="space-y-3">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-800">Reply</h3><button type="button" onClick={() => setReplyOpen(false)} className="text-xs font-semibold text-slate-500">Collapse</button></div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select value={replyTone} onChange={(e) => setReplyTone(e.target.value as ReplyTone)} className="h-10 rounded-lg border px-3 text-sm"><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="short">Short</option><option value="detailed">Detailed</option></select>
                  <button disabled={generating} onClick={async () => { const updated = await onGenerateReply(email.numericId, replyTone); if (updated?.reply) setReplyDraft(updated.reply); }} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">{generating ? "Generating..." : "Generate reply"}</button>
                </div>
                <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="Write your reply..." className="min-h-36 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><span>{replyAttachments.length ? "Add more files (" + replyAttachments.length + " selected)" : "Attach files"}</span><input type="file" multiple className="hidden" onChange={(event) => void handleReplyFileChange(event)} /></label>
                {replyAttachments.length ? <div className="space-y-1">{replyAttachments.map((attachment, index) => <div key={attachment.filename + "-" + index} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="truncate">{attachment.filename}</span><button type="button" onClick={() => setReplyAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}</div> : null}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button disabled={replying || !replyDraft.trim()} onClick={() => void onSendReplyNow(email.numericId, replyDraft, replyTone, replyAttachments)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><FiSend />{replying ? "Sending..." : "Send reply"}</button>
                  <button disabled={replying} onClick={() => void onScheduleReply(email.numericId, { reply: replyDraft, style: replyTone, attachments: replyAttachments, sendAt: new Date(Date.now() + 3600000).toISOString() })} className="h-10 rounded-lg border px-3 text-sm">In 1 hour</button>
                  <button disabled={replying} onClick={() => void onScheduleReply(email.numericId, { reply: replyDraft, style: replyTone, attachments: replyAttachments, sendAt: tomorrowMorning().toISOString() })} className="h-10 rounded-lg border px-3 text-sm">Tomorrow</button>
                  <input type="datetime-local" value={customDateTime} onChange={(e) => setCustomDateTime(e.target.value)} className="h-10 min-w-0 rounded-lg border px-3 text-sm" />
                  <button disabled={!customDateTime || replying} onClick={() => void onScheduleReply(email.numericId, { reply: replyDraft, style: replyTone, attachments: replyAttachments, sendAt: new Date(customDateTime).toISOString() })} className="h-10 rounded-lg bg-slate-200 px-3 text-sm">Schedule</button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
