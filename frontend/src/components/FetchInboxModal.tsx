import { FiMail, FiPlus, FiRefreshCcw, FiX } from "react-icons/fi";

import type { GmailAccount } from "../types/auth";

type FetchInboxModalProps = {
  open: boolean;
  accounts: GmailAccount[];
  selectedValue: string;
  loading: boolean;
  onClose: () => void;
  onChangeSelection: (value: string) => void;
  onAddMail: () => void;
  onConfirm: () => void;
};

export function FetchInboxModal({
  open,
  accounts,
  selectedValue,
  loading,
  onClose,
  onChangeSelection,
  onAddMail,
  onConfirm,
}: FetchInboxModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
              Inbox Sync
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              Choose a mailbox
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Sync up to 100 emails total from all emails or one connected Gmail ID.
            </p>
          </div>
          {!loading ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <FiX />
            </button>
          ) : null}
        </div>

        <div className="space-y-4 px-6 py-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Mail scope</span>
            <select
              value={selectedValue}
              onChange={(event) => onChangeSelection(event.target.value)}
              disabled={loading}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All emails</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-2 text-slate-800">
              <FiMail />
              {accounts.length ? `${accounts.length} connected mailbox(es)` : "No connected mailboxes"}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onAddMail}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <FiPlus />
              Add mail
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <FiRefreshCcw className={loading ? "animate-spin" : ""} />
              {loading ? "Syncing..." : "Sync now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
