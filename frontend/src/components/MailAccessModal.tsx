import { FiChevronDown, FiMail, FiSend, FiShield, FiUserPlus, FiX } from "react-icons/fi";

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
  const hasApprovedReadyMessage = (requestSentMessage ?? "").toLowerCase().includes("ready to connect");
  const showRequestSuccess = Boolean(requestSentMessage) && !hasConnectedRequestedEmail;
  const canStartOtpRequest =
    !hasConnectedRequestedEmail && !canConnectApprovedMail && !hasApprovedReadyMessage && !hasPendingRequestedEmail;
  const canShowConnectAction = (canConnectApprovedMail || hasApprovedReadyMessage) && !hasConnectedRequestedEmail;
  const shouldShowApprovedChoices =
    approvedRequests.length > 0 && !canShowConnectAction && !hasConnectedRequestedEmail;
  const hasHiddenMailboxDetails =
    accounts.length > 0 || approvedRequests.length > 0 || pendingRequests.length > 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-hidden bg-slate-950/55 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="my-2 flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] sm:my-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_34%),linear-gradient(135deg,_#ffffff,_#f8fafc)] px-4 py-3 sm:gap-4 sm:px-5 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 sm:text-xs sm:tracking-[0.22em]">
              Testing Mode
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-slate-900 sm:text-[2rem]">
              Gmail access is limited
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600 sm:mt-2 sm:leading-6">
              Verify the mailbox with Google, then wait for approval. Once approved, it will be ready to connect.
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-5 sm:px-5 sm:py-5">
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,_#fff8e8,_#fff4d8)] p-3 text-sm text-amber-900 sm:rounded-3xl sm:p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500 p-2 text-white shadow-sm sm:rounded-2xl">
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

            {shouldShowApprovedChoices ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 sm:text-[11px]">
                    Approved mail available
                  </p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                    {approvedRequests.length}
                  </span>
                </div>
                <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1">
                  {approvedRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => onRequestedEmailChange(request.requestedAccountEmail)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        normalizedRequestedEmail === request.requestedAccountEmail
                          ? "border-sky-400 bg-white text-sky-800"
                          : "border-sky-100 bg-white/70 text-slate-700 hover:border-sky-200"
                      }`}
                    >
                      <span className="block truncate font-medium">{request.requestedAccountEmail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Mail to connect
              </span>
              <input
                type="email"
                value={requestedEmail}
                onChange={(event) => onRequestedEmailChange(event.target.value)}
                placeholder="name@gmail.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 sm:rounded-2xl sm:px-4 sm:py-3"
              />
            </label>

            {showRequestSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-5 text-emerald-700 sm:rounded-2xl sm:px-4 sm:py-3 sm:leading-6">
                {requestSentMessage}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700 sm:rounded-2xl sm:px-4 sm:py-3 sm:leading-6">
                {error}
              </div>
            ) : null}

            {reconnectRecommended ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 sm:rounded-2xl sm:px-4 sm:py-3">
                If this mail was already approved, reconnect it to refresh Gmail permissions with all required scopes.
              </div>
            ) : null}

            {hasConnectedRequestedEmail ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 sm:rounded-2xl sm:px-4 sm:py-3">
                This mail is already connected and ready for inbox sync.
              </div>
            ) : null}

            {canStartOtpRequest ? (
              <button
                type="button"
                disabled={requesting}
                onClick={() => void onStartRequest()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-4 sm:py-3"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 sm:rounded-2xl sm:px-4 sm:py-3"
              >
                <FiMail />
                {reconnectRecommended ? "Reconnect this mail" : "Connect approved mail"}
              </button>
            ) : null}

            {onOpenAdminRequests ? (
              <button
                type="button"
                onClick={onOpenAdminRequests}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:rounded-2xl sm:px-4 sm:py-3"
              >
                <FiUserPlus />
                Open requests page
              </button>
            ) : null}

            {hasHiddenMailboxDetails ? (
              <details className="group rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden sm:px-4">
                  <span>Mailbox details</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {accounts.length ? `${accounts.length} connected` : null}
                    {pendingRequests.length ? `${pendingRequests.length} pending` : null}
                    <FiChevronDown className="transition group-open:rotate-180" />
                  </span>
                </summary>

                <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Current login
                    </p>
                    <div className="mt-2 flex min-w-0 items-center gap-3">
                      <div className="rounded-xl bg-sky-100 p-2 text-sky-700">
                        <FiMail />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-sm text-slate-600">{user.email}</p>
                      </div>
                    </div>
                  </div>

                  {accounts.length ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Connected Gmail
                      </p>
                      <div className="mt-2 space-y-2">
                        {accounts.map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          >
                            <span className="min-w-0 truncate font-medium text-slate-900">
                              {account.email}
                            </span>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              Connected
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {approvedRequests.length && !shouldShowApprovedChoices ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Approved mails
                      </p>
                      <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1">
                        {approvedRequests.map((request) => (
                          <button
                            key={request.id}
                            type="button"
                            onClick={() => onRequestedEmailChange(request.requestedAccountEmail)}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                              normalizedRequestedEmail === request.requestedAccountEmail
                                ? "border-sky-300 bg-sky-50 text-sky-700"
                                : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {request.requestedAccountEmail}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {pendingRequests.length ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Pending requests
                      </p>
                      <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1">
                        {pendingRequests.map((request) => (
                          <button
                            key={request.id}
                            type="button"
                            onClick={() => onRequestedEmailChange(request.requestedAccountEmail)}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                              normalizedRequestedEmail === request.requestedAccountEmail
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {request.requestedAccountEmail}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
