import { FiMail, FiSend, FiShield, FiUserPlus, FiX } from "react-icons/fi";

import type { GmailAccount, AuthUser, MailAccessRequest } from "../types/auth";

type MailAccessModalProps = {
  open: boolean;
  user: AuthUser;
  accounts: GmailAccount[];
  approvedRequests: MailAccessRequest[];
  pendingRequests: MailAccessRequest[];
  requestedEmail: string;
  requesting: boolean;
  requestSentMessage: string | null;
  error: string | null;
  reconnectRecommended?: boolean;
  onClose: () => void;
  onRequestedEmailChange: (value: string) => void;
  onStartRequest: () => Promise<void>;
  onConnectApprovedMail: () => Promise<void>;
  onOpenAdminRequests?: () => void;
};

export function MailAccessModal({
  open,
  user,
  accounts,
  approvedRequests,
  pendingRequests,
  requestedEmail,
  requesting,
  requestSentMessage,
  error,
  reconnectRecommended = false,
  onClose,
  onRequestedEmailChange,
  onStartRequest,
  onConnectApprovedMail,
  onOpenAdminRequests,
}: MailAccessModalProps) {
  if (!open) {
    return null;
  }

  const normalizedRequestedEmail = requestedEmail.trim().toLowerCase();
  const hasConnectedRequestedEmail = accounts.some(
    (account) => account.email.trim().toLowerCase() === normalizedRequestedEmail
  );
  const canConnectApprovedMail = approvedRequests.some(
    (request) => request.requestedAccountEmail === normalizedRequestedEmail
  );
  const hasPendingRequestedEmail = pendingRequests.some(
    (request) => request.requestedAccountEmail === normalizedRequestedEmail
  );
  const hasApprovedReadyMessage = (requestSentMessage ?? "").toLowerCase().includes("already approved and ready to sync");
  const showRequestSuccess = Boolean(requestSentMessage) && !hasConnectedRequestedEmail;
  const canStartOtpRequest =
    !hasConnectedRequestedEmail && !canConnectApprovedMail && !hasApprovedReadyMessage;
  const canShowConnectAction = (canConnectApprovedMail || hasApprovedReadyMessage) && !hasConnectedRequestedEmail;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="my-3 flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] sm:my-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_34%),linear-gradient(135deg,_#ffffff,_#f8fafc)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">
              Testing Mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight text-slate-900 sm:text-[2rem]">
              Gmail access is limited
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Verify the mailbox with Google, then wait for approval. Once approved, it will be ready to sync.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <FiX />
          </button>
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Current login
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="rounded-2xl bg-sky-100 p-2 text-sky-700">
                  <FiMail />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="truncate text-sm text-slate-600">{user.email}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Connected Gmail
                </p>
                {accounts.length ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Ready to sync
                  </span>
                ) : null}
              </div>
              {accounts.length ? (
                <div className="mt-2 space-y-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {account.email}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Connected
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No Gmail account is connected yet for this login.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Approved mails
                </p>
                {approvedRequests.length ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    Connectable
                  </span>
                ) : null}
              </div>
              {approvedRequests.length ? (
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {approvedRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => onRequestedEmailChange(request.requestedAccountEmail)}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        normalizedRequestedEmail === request.requestedAccountEmail
                          ? "border-sky-300 bg-sky-50 text-sky-700"
                          : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{request.requestedAccountEmail}</span>
                        <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold">
                          Approved
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No approved but unconnected mails are waiting right now.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Pending requests
                </p>
                {pendingRequests.length ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    Awaiting approval
                  </span>
                ) : null}
              </div>
              {pendingRequests.length ? (
                <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {pendingRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => onRequestedEmailChange(request.requestedAccountEmail)}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        normalizedRequestedEmail === request.requestedAccountEmail
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{request.requestedAccountEmail}</span>
                        <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold">
                          Pending
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No pending approvals right now.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,_#fff8e8,_#fff4d8)] p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-500 p-2 text-white shadow-sm">
                  <FiShield />
                </div>
                <div>
                  <p className="text-base font-semibold">
                    {hasConnectedRequestedEmail
                      ? "Mailbox already connected"
                      : canConnectApprovedMail || hasApprovedReadyMessage
                        ? "Mailbox ready"
                      : hasPendingRequestedEmail
                          ? "Approval pending"
                          : "Verification required"}
                  </p>
                  <p className="mt-1 leading-6">
                    {hasConnectedRequestedEmail
                      ? "This mailbox is connected and ready to sync."
                      : canConnectApprovedMail || hasApprovedReadyMessage
                        ? "This mailbox is approved. Connect it to continue."
                        : hasPendingRequestedEmail
                          ? "This mailbox is waiting for approval."
                          : "Enter the mailbox you want to use. Google verification is required before approval."}
                  </p>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Mail to connect
              </span>
              <input
                type="email"
                value={requestedEmail}
                onChange={(event) => onRequestedEmailChange(event.target.value)}
                placeholder="name@gmail.com"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {showRequestSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
                {requestSentMessage}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            {reconnectRecommended ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                If this mail was already approved, reconnect it to refresh Gmail permissions with all required scopes.
              </div>
            ) : null}

            {hasConnectedRequestedEmail ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                This mail is already connected and ready for inbox sync.
              </div>
            ) : null}

            {canStartOtpRequest ? (
              <button
                type="button"
                disabled={requesting}
                onClick={() => void onStartRequest()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiSend />
                {requesting ? "Opening Google verification..." : "Verify with Google and request access"}
              </button>
            ) : null}
            {canStartOtpRequest ? (
              <p className="text-xs leading-5 text-slate-400">
                After Google verification, the approval request is sent automatically.
              </p>
            ) : null}
            {canShowConnectAction ? (
              <button
                type="button"
                onClick={() => void onConnectApprovedMail()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                <FiMail />
                {reconnectRecommended ? "Reconnect this mail" : "Connect approved mail"}
              </button>
            ) : null}

            {onOpenAdminRequests ? (
              <button
                type="button"
                onClick={onOpenAdminRequests}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FiUserPlus />
                Open requests page
              </button>
            ) : null}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
