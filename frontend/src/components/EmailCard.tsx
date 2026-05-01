import { FiClock } from "react-icons/fi";

import type { ProcessedEmail } from "../types/email";
import { getCategoryLabel } from "../utils/emailCategory";

type EmailCardProps = {
  email: ProcessedEmail;
  onOpen: () => void;
  showCheckbox?: boolean;
  selected?: boolean;
  onSelect?: () => void;
};

function getPriorityStyle(priority: string) {
  switch (priority.toLowerCase()) {
    case "high":
      return "bg-rose-100 text-rose-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    case "low":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getEmailDisplayDate(email: ProcessedEmail) {
  return email.originalDate ?? email.createdAt ?? email.updatedAt;
}

export function EmailCard({
  email,
  onOpen,
  showCheckbox,
  selected,
  onSelect,
}: EmailCardProps) {
  return (
    <div className="relative">
      <article
        className="
          group relative flex flex-col h-full
          rounded-[28px] border border-sky-100/80
          bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,248,255,0.92))]
          backdrop-blur-md
          p-5
          transition-all duration-300
          hover:-translate-y-[3px] hover:border-sky-200 hover:shadow-[0_22px_50px_-24px_rgba(14,116,144,0.45)]
        "
      >
        {/* Gradient Accent */}
        <div className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-400 rounded-t-[28px] opacity-90" />

        {/* Clickable Content */}
        <button type="button" onClick={onOpen} className="w-full text-left space-y-3">
          {/* Header */}
          <div className="flex justify-between items-start gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {showCheckbox ? (
                <label
                  className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={onSelect}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ) : null}

              <div className="min-w-0 space-y-1">
                <p className="text-base font-semibold text-slate-900 line-clamp-1">
                  {email.subject}
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {email.sender}
                </p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 justify-end">
              {email.followUpPending && (
                <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-yellow-100 text-yellow-700">
                  Pending
                </span>
              )}

              <span
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${getPriorityStyle(
                  email.priority
                )}`}
              >
                {email.priority}
              </span>

              <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-slate-100 text-slate-700">
                {getCategoryLabel(email.category)}
              </span>
            </div>
          </div>

          {/* Automation */}
          {email.automationActions?.length ? (
            <div className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              {email.automationActions.slice(0, 2).join(" • ")}
            </div>
          ) : null}
        </button>

        {/* Footer */}
        <div className="mt-auto flex items-center pt-4 border-t border-sky-100/80">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FiClock className="text-sky-500" />
            {new Date(getEmailDisplayDate(email)).toLocaleString()}
          </div>
        </div>
      </article>
    </div>
  );
}
