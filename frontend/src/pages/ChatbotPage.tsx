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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-30px_rgba(15,23,42,0.25)] sm:rounded-[28px]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_32%),linear-gradient(135deg,_#020617,_#0f172a)] px-3 py-2 text-white sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.16em] text-sky-200 sm:text-[11px] sm:tracking-[0.2em]">Inbox AI</p>
          <h2 className="truncate text-base font-semibold leading-5 sm:text-xl sm:leading-6">MailPilot Assistant</h2>
          <p className="hidden mt-1 text-xs leading-5 text-sky-100/80 sm:block">
            Ask about inbox activity, filters, replies, or actions.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            title="Back"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white transition hover:bg-white/10 sm:h-9 sm:w-9 sm:rounded-xl"
          >
            <FiArrowLeft />
          </button>
          <div
            aria-label="Fullscreen"
            title="Fullscreen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white sm:h-9 sm:w-9 sm:rounded-xl"
          >
            <FiMaximize2 />
          </div>
        </div>
      </div>
      <div className="h-[min(390px,calc(100dvh-270px))] min-h-[320px] bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] p-1 sm:h-[calc(100vh-220px)] sm:p-4">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-[24px]">
          <div className={`flex-1 space-y-1.5 p-2 sm:space-y-3 sm:p-4 ${mailPilot.chatLog.length === 0 ? "overflow-hidden" : "overflow-y-auto"}`}>
            {mailPilot.chatLog.length === 0 ? (
              <div className="space-y-1.5 sm:space-y-4">
                <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-2.5 py-1.5 sm:rounded-3xl sm:p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-600 sm:text-[10px] sm:tracking-[0.22em]">
                    Suggested prompts
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">
                    Tap a prompt to send it directly.
                  </p>
                </div>
                <div className="grid gap-1 md:grid-cols-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={async () => {
                        await onSubmitRequest(prompt);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] leading-5 text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 sm:rounded-2xl sm:px-3 sm:py-3 sm:text-[13px]"
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
                  className={`max-w-[86%] rounded-[16px] px-3 py-2 text-xs leading-5 shadow-sm sm:max-w-[74%] sm:rounded-[18px] sm:py-2.5 sm:text-[13px] ${
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
                <div className="max-w-[86%] rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm sm:max-w-[74%] sm:rounded-[18px] sm:py-2.5 sm:text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                    Processing your inbox question...
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <form
            className="border-t border-slate-200 bg-white p-1.5 sm:p-4"
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
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-1 shadow-inner sm:rounded-[24px] sm:p-2">
              <div className="flex gap-1.5 sm:gap-2">
                <input
                  name="message"
                  placeholder="Ask anything or describe an action..."
                  className="min-w-0 flex-1 rounded-md bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-sky-100 sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={mailPilot.chatLoading}
                  className="rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-[18px] sm:px-5 sm:py-3 sm:text-sm"
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
