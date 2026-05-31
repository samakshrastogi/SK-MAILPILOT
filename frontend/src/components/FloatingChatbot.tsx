import { useEffect, useRef, useState } from "react";
import { FiMaximize2, FiMessageCircle, FiMinus, FiSend, FiX } from "react-icons/fi";

import type { useMailPilotData } from "../hooks/useMailPilotData";

type FloatingChatbotProps = {
  mailPilot: ReturnType<typeof useMailPilotData>;
  onOpenFullscreen: () => void;
  onSubmitRequest: (message: string) => Promise<void>;
};

const starterPrompts = [
  "Summarize my inbox",
  "Show high priority emails",
  "Open finance emails",
  "Create a rule for noreply senders",
  "List top senders",
];

export function FloatingChatbot({ mailPilot, onOpenFullscreen, onSubmitRequest }: FloatingChatbotProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mailPilot.chatLog]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        open &&
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !toggleRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [open]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-50 sm:inset-x-auto sm:bottom-12 sm:right-10" ref={panelRef}>
        <div
          className={`origin-bottom-right transform transition-all duration-300 ${
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-95 opacity-0"
          }`}
        >
          <section className="flex max-h-[calc(100vh-7rem)] min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-25px_rgba(15,23,42,0.35)] sm:h-[560px] sm:w-[400px] sm:max-w-[95vw] sm:rounded-[30px]">
            <header className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_32%),linear-gradient(135deg,_#020617,_#0f172a)] px-3 py-2.5 text-white sm:px-4 sm:py-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-[0.18em] text-sky-200 sm:text-[11px] sm:tracking-[0.2em]">Inbox AI</p>
                <h2 className="truncate text-sm font-semibold">MailPilot Assistant</h2>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-5 text-sky-100/75 sm:mt-1 sm:line-clamp-none">
                  Ask a question or tell MailPilot to do something.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <button
                  type="button"
                  onClick={onOpenFullscreen}
                  className="rounded-lg p-1.5 text-slate-200 transition hover:bg-white/10 hover:text-white sm:p-2"
                  title="Open fullscreen chatbot"
                >
                  <FiMaximize2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-200 transition hover:bg-white/10 hover:text-white sm:p-2"
                  title="Minimize chatbot"
                >
                  <FiMinus size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-200 transition hover:bg-white/10 hover:text-white sm:p-2"
                  title="Close chatbot"
                >
                  <FiX size={15} />
                </button>
              </div>
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] px-3 py-3 sm:space-y-3 sm:px-4 sm:py-4">
              {mailPilot.chatLog.length === 0 ? (
                <div className="rounded-2xl border border-sky-100 bg-white/90 p-2.5 shadow-sm sm:rounded-3xl sm:p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600 sm:tracking-[0.22em]">
                      Suggested prompts
                    </p>
                    <span className="text-[11px] text-slate-400">Tap to send</span>
                  </div>
                  <div className="grid gap-1.5 sm:gap-2">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void onSubmitRequest(prompt);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 sm:rounded-2xl sm:py-2.5"
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
                    className={`max-w-[86%] rounded-[18px] px-3 py-2 text-[13px] leading-5 shadow-sm sm:max-w-[78%] sm:py-2.5 ${
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
                  <div className="max-w-[86%] rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600 shadow-sm sm:max-w-[78%] sm:py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                      Processing your request...
                    </div>
                  </div>
                </div>
              ) : null}

              <div ref={chatEndRef} />
            </div>

            <form
              className="border-t border-slate-200 bg-white p-2.5 sm:p-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!message.trim()) {
                  return;
                }

                await onSubmitRequest(message);
                setMessage("");
              }}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-1.5 shadow-inner sm:rounded-[24px] sm:p-2">
                <div className="flex gap-2">
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ask anything or describe an action..."
                    className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-sky-100 sm:rounded-[18px] sm:px-4 sm:py-3"
                  />
                  <button
                    type="submit"
                    disabled={mailPilot.chatLoading}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-3 py-2.5 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-[18px] sm:px-4 sm:py-3"
                    title={mailPilot.chatLoading ? "Processing" : "Send"}
                  >
                    <FiSend size={16} />
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </div>

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-[0_18px_45px_-15px_rgba(37,99,235,0.7)] transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
      >
        <FiMessageCircle size={24} />
      </button>
    </>
  );
}
