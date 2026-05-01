import { FiArrowLeft, FiMaximize2 } from "react-icons/fi";
import type { useMailPilotData } from "../hooks/useMailPilotData";

type ChatbotPageProps = {
  mailPilot: ReturnType<typeof useMailPilotData>;
  onClose: () => void;
  onSubmitRequest: (message: string) => Promise<void>;
};

const starterPrompts = [
  "Summarize my inbox",
  "Show high priority emails",
  "Open finance emails",
  "Create a rule for noreply senders",
  "List top senders",
];

export function ChatbotPage({ mailPilot, onClose, onSubmitRequest }: ChatbotPageProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-30px_rgba(15,23,42,0.25)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_32%),linear-gradient(135deg,_#020617,_#0f172a)] px-5 py-4 text-white">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200">Inbox AI</p>
          <h2 className="text-xl font-semibold">MailPilot Assistant</h2>
          <p className="mt-1 text-xs leading-5 text-sky-100/80">
            Ask anything about the inbox or tell MailPilot what to do. It can explain, filter, navigate, or start actions from here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/10"
          >
            <FiArrowLeft />
            Back
          </button>
          <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
            <FiMaximize2 />
            Fullscreen
          </div>
        </div>
      </div>
      <div className="h-[calc(100vh-220px)] bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] p-4">
        <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {mailPilot.chatLog.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-sky-100 bg-sky-50/80 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-600">
                    Suggested prompts
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Tap a prompt to send it directly.
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={async () => {
                        await onSubmitRequest(prompt);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-[13px] text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mailPilot.chatLog.map((entry, index) => (
              <div
                key={`${entry.role}-${index}`}
                className={`flex ${entry.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[74%] rounded-[18px] px-3 py-2.5 text-[13px] leading-5 shadow-sm ${
                    entry.role === "assistant"
                      ? "border border-slate-200 bg-white text-slate-800"
                      : "bg-gradient-to-br from-sky-600 to-indigo-700 text-white"
                  }`}
                >
                  {entry.message}
                </div>
              </div>
            ))}

            {mailPilot.chatLoading ? (
              <div className="flex justify-start">
                <div className="max-w-[74%] rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-600 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                    Processing your inbox question...
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <form
            className="border-t border-slate-200 bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const message = String(form.get("message") ?? "").trim();
              if (!message) {
                return;
              }

              await onSubmitRequest(message);
              event.currentTarget.reset();
            }}
          >
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-2 shadow-inner">
              <div className="flex gap-2">
                <input
                  name="message"
                  placeholder="Ask anything or describe an action..."
                  className="flex-1 rounded-[18px] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="submit"
                  disabled={mailPilot.chatLoading}
                  className="rounded-[18px] bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mailPilot.chatLoading ? "Processing..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
