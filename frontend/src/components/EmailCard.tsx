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
    <div className="relative min-w-0 max-w-full overflow-hidden">
      <article
        className="
          group relative flex h-full min-w-0 max-w-full flex-col overflow-hidden
          rounded-lg border border-sky-100/80 sm:rounded-xl
          bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,248,255,0.92))]
          backdrop-blur-md
          p-2.5 sm:p-3
          transition-all duration-300
          hover:-translate-y-[1px] hover:border-sky-200 hover:shadow-[0_16px_36px_-24px_rgba(14,116,144,0.45)]
        "
      >
        {/* Gradient Accent */}
        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-400 opacity-90" />

        {/* Clickable Content */}
        <button type="button" onClick={onOpen} className="min-w-0 max-w-full space-y-1.5 text-left sm:space-y-2">
          {/* Header */}
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {showCheckbox ? (
                <label
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
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

              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-semibold leading-5 text-slate-900">
                  {email.subject}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {email.sender}
                </p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex max-w-[44%] shrink-0 flex-col items-end gap-1 sm:max-w-[38%]">
              {email.followUpPending && (
                <span className="max-w-full truncate rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700 sm:px-2">
                  Pending
                </span>
              )}

              <span
                className={`max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 ${getPriorityStyle(
                  email.priority
                )}`}
              >
                {email.priority}
              </span>

              <span className="max-w-full truncate rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 sm:px-2">
                {getCategoryLabel(email.category)}
              </span>
            </div>
          </div>

          {/* Automation */}
          {email.automationActions?.length ? (
            <div className="inline-flex max-w-full items-center overflow-hidden rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              <span className="truncate">{email.automationActions.slice(0, 2).join(" • ")}</span>
            </div>
          ) : null}
        </button>

        {/* Footer */}
        <div className="mt-auto min-w-0 border-t border-sky-100/80 pt-1.5 sm:pt-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <FiClock className="shrink-0 text-sm text-sky-500" />
            <span className="truncate">{new Date(getEmailDisplayDate(email)).toLocaleString()}</span>
          </div>
        </div>
      </article>
    </div>
  );
}
