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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mailPilot.chatLog]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      if (open && panelRef.current && !panelRef.current.contains(target)) {
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
      <div className="pointer-events-none fixed bottom-12 right-10 z-50" ref={panelRef}>
        <div
          className={`origin-bottom-right transform transition-all duration-300 ${
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-95 opacity-0"
          }`}
        >
          <section className="flex h-[560px] w-[400px] max-w-[95vw] flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_-25px_rgba(15,23,42,0.35)]">
            <header className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_32%),linear-gradient(135deg,_#020617,_#0f172a)] px-4 py-3 text-white">
              <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200">Inbox AI</p>
                <h2 className="text-sm font-semibold">MailPilot Assistant</h2>
                <p className="mt-1 text-[11px] leading-5 text-sky-100/75">
                  Ask a question or tell MailPilot to do something.
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenFullscreen}
                  className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Open fullscreen chatbot"
                >
                  <FiMaximize2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Minimize chatbot"
                >
                  <FiMinus size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Close chatbot"
                >
                  <FiX size={15} />
                </button>
              </div>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] px-4 py-4">
              {mailPilot.chatLog.length === 0 ? (
                <div className="rounded-3xl border border-sky-100 bg-white/90 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-600">
                      Suggested prompts
                    </p>
                    <span className="text-[11px] text-slate-400">Tap to send</span>
                  </div>
                  <div className="grid gap-2">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void onSubmitRequest(prompt);
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
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
                    className={`max-w-[78%] rounded-[18px] px-3 py-2.5 text-[13px] leading-5 shadow-sm ${
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
                  <div className="max-w-[78%] rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-600 shadow-sm">
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
              className="border-t border-slate-200 bg-white p-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!message.trim()) {
                  return;
                }

                await onSubmitRequest(message);
                setMessage("");
              }}
            >
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-2 shadow-inner">
                <div className="flex gap-2">
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ask anything or describe an action..."
                    className="flex-1 rounded-[18px] bg-white px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-sky-100"
                  />
                  <button
                    type="submit"
                    disabled={mailPilot.chatLoading}
                    className="inline-flex items-center justify-center rounded-[18px] bg-slate-900 px-4 py-3 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-6 right-6 z-50 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-[0_18px_45px_-15px_rgba(37,99,235,0.7)] transition hover:scale-105 active:scale-95"
      >
        <FiMessageCircle size={24} />
      </button>
    </>
  );
}
