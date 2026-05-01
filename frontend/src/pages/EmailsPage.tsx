import { useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar, FiCpu, FiFilter, FiGrid, FiList, FiSearch, FiX } from "react-icons/fi";

import { EmailCard } from "../components/EmailCard";
import { EmailModal } from "../components/EmailModal";
import { Pagination } from "../components/Pagination";
import type { useMailPilotData } from "../hooks/useMailPilotData";
import type { ComposeAttachmentInput, ProcessedEmail } from "../types/email";

type EmailsPageProps = {
  mailPilot: ReturnType<typeof useMailPilotData>;
  onBulkDelete: () => void;
  onBulkSpam: () => void;
  onBulkRead: () => void;
  onBulkUnread: () => void;
  onBulkReply: () => void;
};

function getEmailDisplayDate(email: ProcessedEmail) {
  return email.originalDate ?? email.createdAt ?? email.updatedAt;
}

export function EmailsPage({
  mailPilot,
  onBulkDelete,
  onBulkSpam,
  onBulkRead,
  onBulkUnread,
  onBulkReply,
}: EmailsPageProps) {
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [dateWindow, setDateWindow] = useState<"latest" | "last7" | "last30" | "custom">("latest");

  const senderOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        [...mailPilot.senders, mailPilot.senderFilter].filter(
          (value) => value && value !== "all"
        )
      )
    ).sort();
    return ["all", ...values];
  }, [mailPilot.senders, mailPilot.senderFilter]);

  const categoryOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        [...mailPilot.emails.map((email) => email.category), mailPilot.categoryFilter].filter(
          (value) => value && value !== "all"
        )
      )
    ).sort();
    return ["all", ...values];
  }, [mailPilot.categoryFilter, mailPilot.emails]);

  const priorityOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        [...mailPilot.emails.map((email) => email.priority), mailPilot.priorityFilter].filter(
          (value) => value && value !== "all"
        )
      )
    ).sort();
    return ["all", ...values];
  }, [mailPilot.emails, mailPilot.priorityFilter]);

  const hasActiveFilters =
    mailPilot.pendingOnly ||
    mailPilot.senderFilter !== "all" ||
    mailPilot.categoryFilter !== "all" ||
    mailPilot.priorityFilter !== "all" ||
    dateWindow !== "latest" ||
    Boolean(mailPilot.dateFrom || mailPilot.dateTo);

  useEffect(() => {
    if (hasActiveFilters) {
      setShowFilters(true);
    }
  }, [hasActiveFilters]);

  useEffect(() => {
    if (mailPilot.groupByThread) {
      mailPilot.setGroupByThread(false);
    }
  }, [mailPilot.groupByThread, mailPilot.setGroupByThread]);

  useEffect(() => {
    if (dateWindow === "latest") {
      mailPilot.setDateFrom("");
      mailPilot.setDateTo("");
      return;
    }

    const today = new Date();
    const end = today.toISOString().slice(0, 10);

    if (dateWindow === "last7") {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      mailPilot.setDateFrom(start.toISOString().slice(0, 10));
      mailPilot.setDateTo(end);
      return;
    }

    if (dateWindow === "last30") {
      const start = new Date();
      start.setDate(today.getDate() - 29);
      mailPilot.setDateFrom(start.toISOString().slice(0, 10));
      mailPilot.setDateTo(end);
    }
  }, [dateWindow]);

  useEffect(() => {
    if ((mailPilot.dateFrom || mailPilot.dateTo) && dateWindow === "latest") {
      setDateWindow("custom");
    }
  }, [dateWindow, mailPilot.dateFrom, mailPilot.dateTo]);

  useEffect(() => {
    if (!mailPilot.dateFrom && !mailPilot.dateTo) {
      if (dateWindow !== "latest") {
        setDateWindow("latest");
      }
      return;
    }

    if (!mailPilot.dateFrom || !mailPilot.dateTo) {
      if (dateWindow !== "custom") {
        setDateWindow("custom");
      }
      return;
    }

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const last7 = new Date();
    last7.setDate(today.getDate() - 6);
    const last30 = new Date();
    last30.setDate(today.getDate() - 29);
    const last7Key = last7.toISOString().slice(0, 10);
    const last30Key = last30.toISOString().slice(0, 10);

    if (mailPilot.dateFrom === todayKey && mailPilot.dateTo === todayKey) {
      if (dateWindow !== "custom") {
        setDateWindow("custom");
      }
      return;
    }

    if (mailPilot.dateFrom === last7Key && mailPilot.dateTo === todayKey) {
      if (dateWindow !== "last7") {
        setDateWindow("last7");
      }
      return;
    }

    if (mailPilot.dateFrom === last30Key && mailPilot.dateTo === todayKey) {
      if (dateWindow !== "last30") {
        setDateWindow("last30");
      }
      return;
    }

    if (dateWindow !== "custom") {
      setDateWindow("custom");
    }
  }, [dateWindow, mailPilot.dateFrom, mailPilot.dateTo]);

  function toggleSelected(id: number) {
    mailPilot.setSelectedEmailIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  async function handleGenerateReply(id: number, style: Parameters<typeof mailPilot.generateReplyDraft>[1]) {
    const updatedEmail = await mailPilot.generateReplyDraft(id, style);
    if (updatedEmail && selectedEmail?._id === updatedEmail._id) {
      setSelectedEmail(updatedEmail);
    }
    return updatedEmail;
  }

  async function handleSendReplyNow(
    id: number,
    reply?: string,
    style?: Parameters<typeof mailPilot.sendReplyNow>[2],
    attachments?: ComposeAttachmentInput[]
  ) {
    const updatedEmail = await mailPilot.sendReplyNow(id, reply, style, attachments);
    if (updatedEmail && selectedEmail?._id === updatedEmail._id) {
      setSelectedEmail(updatedEmail);
    }
    return updatedEmail;
  }

  async function handleScheduleReply(id: number, payload: Parameters<typeof mailPilot.scheduleReply>[1]) {
    const updatedEmail = await mailPilot.scheduleReply(id, payload);
    if (updatedEmail && selectedEmail?._id === updatedEmail._id) {
      setSelectedEmail(updatedEmail);
    }
    return updatedEmail;
  }

  function resetWorkspaceFilters() {
    mailPilot.setPage(1);
    mailPilot.setSearch("");
    mailPilot.setPendingOnly(false);
    mailPilot.setSenderFilter("all");
    mailPilot.setCategoryFilter("all");
    mailPilot.setPriorityFilter("all");
    mailPilot.setDateFrom("");
    mailPilot.setDateTo("");
    mailPilot.setSortBy("latest");
    mailPilot.setGroupByThread(false);
    setDateWindow("latest");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] backdrop-blur-xl shadow-[0_20px_60px_-36px_rgba(14,116,144,0.45)] transition-all duration-200">

        {/* HEADER */}
        <div className="px-5 py-4 sm:px-6 flex flex-col gap-4">

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

            {/* Left */}
            <div>
              <p className="text-[10px] tracking-[0.34em] uppercase text-sky-600 font-semibold">
                Inbox Workspace Controls
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 tracking-tight">
                Inbox workspace
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {hasActiveFilters
                  ? "Filters are active."
                  : "Viewing all messages."}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Review synced emails, apply filters, and open any message to reply or inspect attachments.
              </p>
              <div className="mt-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    mailPilot.loading
                      ? "bg-amber-50 text-amber-700"
                      : mailPilot.refreshing
                        ? "bg-sky-50 text-sky-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {mailPilot.loading ? "Loading inbox" : mailPilot.refreshing ? "Updating" : "Ready"}
                </span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex flex-wrap items-center gap-2">

              {/* SEARCH */}
              <div
                className={`flex items-center overflow-hidden rounded-xl border bg-white transition-all duration-200 ${
                  searchExpanded || mailPilot.search
                    ? "w-full sm:w-[22rem] border-sky-400 shadow-md shadow-sky-100"
                    : "w-11 border-slate-200 hover:border-slate-300"
                }`}
                onMouseEnter={() => setSearchExpanded(true)}
                onMouseLeave={() => !mailPilot.search && setSearchExpanded(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSearchExpanded(true);
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                  }}
                  title="Search emails"
                  className={`h-11 w-11 flex items-center justify-center transition ${
                    searchExpanded || mailPilot.search ? "text-sky-600" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <FiSearch size={18} />
                </button>

                <input
                  ref={searchInputRef}
                  value={mailPilot.search}
                  onChange={(e) => {
                    mailPilot.setPage(1);
                    mailPilot.setSearch(e.target.value);
                  }}
                  onBlur={() => !mailPilot.search && setSearchExpanded(false)}
                  placeholder={searchExpanded || Boolean(mailPilot.search) ? "Search messages" : ""}
                  className={`h-11 bg-transparent pr-2 text-sm outline-none placeholder:text-slate-400 transition-all duration-200 ${
                    searchExpanded || mailPilot.search
                      ? "w-full flex-1 opacity-100"
                      : "w-0 flex-none px-0 opacity-0 pointer-events-none"
                  }`}
                />

                {mailPilot.search && (
                  <button
                    type="button"
                    onClick={() => {
                      mailPilot.setSearch("");
                      mailPilot.setPage(1);
                    }}
                    title="Clear search"
                    className="h-11 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
                  >
                    <FiX size={18} />
                  </button>
                )}
              </div>

              {/* VIEW TOGGLE */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                {[
                  { key: "grid" as const, icon: <FiGrid /> },
                  { key: "list" as const, icon: <FiList /> },
                ].map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setViewMode(v.key)}
                    className={`px-3 py-2 rounded-lg text-sm transition ${viewMode === v.key
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    {v.icon}
                  </button>
                ))}
              </div>

              {/* FILTER TOGGLE */}
              <button
                onClick={() => setShowFilters((c) => !c)}
                className={`h-10 w-10 flex items-center justify-center rounded-xl border transition ${showFilters
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <FiFilter />
              </button>

              {/* SELECTION */}
              {hasActiveFilters ? (
                <button
                  onClick={resetWorkspaceFilters}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100"
                >
                  Reset filters
                </button>
              ) : null}

              {mailPilot.selectedEmailIds.length > 0 && (
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {mailPilot.selectedEmailIds.length} selected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* FILTER PANEL */}
        {showFilters && (
          <div className="border-t border-sky-100/80 px-6 py-5 space-y-5">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-800">
              Filters affect only the current view. Bulk actions use the visible selection.
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-2">

              {/* Compact Select */}
              {[
                {
                  value: mailPilot.pendingOnly ? "pending" : "all",
                  onChange: (v: string) => {
                    mailPilot.setPage(1);
                    mailPilot.setPendingOnly(v === "pending");
                  },
                  options: [
                    { value: "all", label: "All messages" },
                    { value: "pending", label: "Pending" },
                  ],
                  label: "Status"
                },
              ].map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">{item.label}</label>
                  <select
                    value={item.value}
                    onChange={(e) => item.onChange(e.target.value)}
                    title={item.label}
                    className="h-10 px-3 rounded-xl border-2 border-slate-200 bg-white text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition hover:border-slate-300 cursor-pointer"
                  >
                    {item.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Other Filters */}
              {[
                { value: mailPilot.senderFilter, options: senderOptions, label: "Sender" },
                { value: mailPilot.categoryFilter, options: categoryOptions, label: "Category" },
                { value: mailPilot.priorityFilter, options: priorityOptions, label: "Priority" },
              ].map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">{item.label}</label>
                  <select
                    value={item.value}
                    onChange={(e) => {
                      mailPilot.setPage(1);
                      if (i === 0) mailPilot.setSenderFilter(e.target.value);
                      else if (i === 1) mailPilot.setCategoryFilter(e.target.value as never);
                      else if (i === 2) mailPilot.setPriorityFilter(e.target.value as never);
                    }}
                    title={item.label}
                    className="h-10 px-3 rounded-xl border-2 border-slate-200 bg-white text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition hover:border-slate-300 cursor-pointer"
                  >
                    {item.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "all" ? "All" : opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Date Range</label>
                <select
                  value={dateWindow}
                  onChange={(e) => {
                    mailPilot.setPage(1);
                    setDateWindow(e.target.value as "latest" | "last7" | "last30" | "custom");
                  }}
                  title="Date range"
                  className="h-10 px-3 rounded-xl border-2 border-slate-200 text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition bg-white hover:border-slate-300 cursor-pointer"
                >
                  <option value="latest">Latest</option>
                  <option value="last7">Past 7 days</option>
                  <option value="last30">Past 30 days</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {dateWindow === "custom" && (
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">From:</label>
                    <div className="relative">
                      <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                      <input
                        type="date"
                        value={mailPilot.dateFrom}
                        onChange={(e) => mailPilot.setDateFrom(e.target.value)}
                        title="Start date"
                        className="h-10 pl-9 pr-3 rounded-xl border-2 border-slate-200 text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition bg-white hover:border-slate-300"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">To:</label>
                    <div className="relative">
                      <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                      <input
                        type="date"
                        value={mailPilot.dateTo}
                        onChange={(e) => mailPilot.setDateTo(e.target.value)}
                        title="End date"
                        className="h-10 pl-9 pr-3 rounded-xl border-2 border-slate-200 text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition bg-white hover:border-slate-300"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Sort */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Sort By</label>
                <select
                  value={mailPilot.sortBy}
                  onChange={(e) => {
                    mailPilot.setPage(1);
                    mailPilot.setSortBy(e.target.value as "latest" | "oldest" | "priority" | "sender");
                  }}
                  title="Sort order"
                  className="h-10 px-3 rounded-xl border-2 border-slate-200 text-sm focus:border-sky-400 focus:outline-none focus:shadow-lg focus:shadow-sky-100 transition bg-white hover:border-slate-300 cursor-pointer"
                >
                  <option value="latest">Latest</option>
                  <option value="oldest">Oldest</option>
                  <option value="priority">Priority</option>
                  <option value="sender">Sender</option>
                </select>
              </div>
            </div>

            {/* ACTION BAR */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">

              {/* AI */}
              <button
                disabled={mailPilot.bulkGeneratingFollowUps}
                onClick={() => void mailPilot.generateRepliesForFollowUps()}
                className="h-10 px-4 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition flex items-center gap-2"
              >
                <FiCpu />
                {mailPilot.bulkGeneratingFollowUps ? "Generating..." : "Generate replies"}
              </button>

              {/* BULK */}
              <div className="flex flex-wrap gap-2">
                {!mailPilot.selectionMode ? (
                  <button onClick={() => mailPilot.setSelectionMode(true)} className="h-10 px-3 rounded-lg border text-sm hover:bg-slate-50">
                    Select messages
                  </button>
                ) : (
                  <>
                    {[
                      { label: "Read", fn: onBulkRead },
                      { label: "Unread", fn: onBulkUnread },
                      { label: "Spam", fn: onBulkSpam, style: "amber" },
                      { label: "Delete", fn: onBulkDelete, style: "rose" },
                      { label: "AI Reply", fn: onBulkReply, style: "sky" },
                    ].map((btn, i) => (
                      <button
                        key={i}
                        disabled={!mailPilot.selectedEmailIds.length}
                        onClick={btn.fn}
                        className={`h-10 px-3 rounded-lg text-sm disabled:opacity-40
                    ${btn.style === "amber"
                            ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : btn.style === "rose"
                              ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                              : btn.style === "sky"
                                ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
                                : "border hover:bg-slate-50"
                          }`}
                      >
                        {btn.label}
                      </button>
                    ))}

                    <button
                      onClick={() =>
                        mailPilot.setSelectedEmailIds(mailPilot.emails.map((e) => e.numericId))
                      }
                      className="h-10 px-3 text-sm rounded-lg border hover:bg-slate-50"
                    >
                      Select page
                    </button>

                    <button
                      onClick={() => {
                        mailPilot.setSelectedEmailIds([]);
                        mailPilot.setSelectionMode(false);
                      }}
                      className="h-10 px-3 text-sm rounded-lg border hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {viewMode === "grid" ? (
        <section className="grid gap-5 md:grid-cols-2">
          {mailPilot.emails.map((email) => {
            const selected = mailPilot.selectedEmailIds.includes(email.numericId);

            return (
              <div
                key={email._id}
                className={`relative rounded-2xl transition-all duration-200
            ${selected ? "ring-2 ring-blue-500" : ""}
          `}
              >
                <EmailCard
                  email={email}
                  showCheckbox={mailPilot.selectionMode}
                  selected={selected}
                  onSelect={() => toggleSelected(email.numericId)}
                  onOpen={() => setSelectedEmail(email)}
                />
              </div>
            );
          })}
        </section>
      ) : (
        <section className="space-y-3">
          {mailPilot.emails.map((email) => {
            const selected = mailPilot.selectedEmailIds.includes(email.numericId);

            return (
              <button
                key={email._id}
                type="button"
                onClick={() => setSelectedEmail(email)}
                className={`group w-full rounded-2xl 
          border px-5 py-4 text-left bg-white/90 backdrop-blur-sm
          transition-all duration-200
          hover:-translate-y-[1px] hover:shadow-md
          ${selected
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-slate-200 hover:border-slate-300"
                  }
        `}
              >
                {/* LEFT */}
                <div className="min-w-0">

                  {/* TOP */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                    {/* LEFT TEXT */}
                    <div className="min-w-0 space-y-1">
                      {mailPilot.selectionMode ? (
                        <span
                          className="mb-2 flex h-5 w-5 items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelected(email.numericId)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </span>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">

                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {email.subject}
                        </p>

                        {email.followUpPending && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                            Pending reply
                          </span>
                        )}
                        {(email.threadMessageCount ?? 1) > 1 && (
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                            {email.threadMessageCount} in thread
                          </span>
                        )}
                        {email.replyRiskStatus === "overdue" && (
                          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                            Overdue
                          </span>
                        )}
                        {email.replyRiskStatus === "at-risk" && (
                          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                            At risk
                          </span>
                        )}
                      </div>

                      <p className="truncate text-sm text-slate-500">
                        {email.sender}
                      </p>
                    </div>

                    {/* DATE */}
                    <div className="shrink-0 text-xs font-medium text-slate-400 whitespace-nowrap">
                      {new Date(getEmailDisplayDate(email)).toLocaleString()}
                    </div>
                  </div>

                  {/* BODY */}
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {email.summary || email.content}
                  </p>

                  {/* TAGS */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    {(email.threadMessageCount ?? 1) > 1 && (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
                        {email.threadParticipants?.length ?? 0} participants
                      </span>
                    )}

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      {email.category}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 font-medium
                ${email.priority === "high"
                          ? "bg-red-50 text-red-600"
                          : email.priority === "medium"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-blue-50 text-blue-600"
                        }
              `}
                    >
                      {email.priority}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {mailPilot.loading && !mailPilot.emails.length ? (
        <section className="rounded-[28px] border border-slate-200 bg-white/90 p-10 shadow-sm">
          <div className="space-y-4">
            <div className="h-4 w-40 animate-pulse rounded-full bg-slate-100" />
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                  <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
                  <div className="mt-4 h-5 w-3/4 animate-pulse rounded-full bg-slate-200" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-slate-100" />
                  <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {!mailPilot.loading && !mailPilot.emails.length ? (
        <section className="rounded-[28px] border border-slate-200 bg-white/90 backdrop-blur-xl p-12 text-center shadow-sm hover:shadow-md transition-all duration-200">

          {/* Icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            <FiFilter className="text-2xl" />
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
            No emails found
          </h3>

          {/* Description */}
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            Clear filters or sync the inbox to load messages.
          </p>

          {/* Actions */}
          <div className="mt-5 text-sm font-medium text-slate-500">
            Use sync to refresh this view.
          </div>
        </section>
      ) : null}

      <Pagination page={mailPilot.page} totalPages={mailPilot.totalPages} onPageChange={mailPilot.setPage} />

      <EmailModal
        key={selectedEmail?._id ?? "email-modal-empty"}
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
        onGenerateReply={handleGenerateReply}
        onSendReplyNow={handleSendReplyNow}
        onScheduleReply={handleScheduleReply}
        replying={mailPilot.replyingId === selectedEmail?.numericId}
        generating={mailPilot.generatingReplyId === selectedEmail?.numericId}
      />
    </div>
  );
}
