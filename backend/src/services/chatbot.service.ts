import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { GmailAccountModel } from "../models/gmail-account.model";
import { InboxRuleModel } from "../models/inbox-rule.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { NotificationModel } from "../models/notification.model";
import { ScheduledEmailModel } from "../models/scheduled-email.model";
import { UserModel } from "../models/user.model";
import { EmailModel } from "../models/email.model";
import {
  buildCategoryMongoFilter,
  canonicalEmailCategories,
  getEmailCategoryLabel,
} from "./email-classification.service";
import { trashMessageFromGmail } from "./gmail.service";
import { llm, withLlmTimeout } from "./llm.service";
import { syncInboxToDatabase } from "./inbox-sync.service";

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  message: string;
};

export type InboxChatScope = {
  userId: string;
  accountId?: string | null;
  includeAllAccounts?: boolean;
  history?: ChatHistoryEntry[];
};

type ChatUiAction =
  | {
      type: "navigate";
      route:
        | "dashboard"
        | "emails"
        | "compose"
        | "chatbot"
        | "mail-access"
        | "sender-insights"
        | "sync-history"
        | "audit-center"
        | "team"
        | "tutorial";
    }
  | {
      type: "open_emails";
      clearFilters?: boolean;
      priority?: "low" | "medium" | "high" | null;
      category?: (typeof canonicalEmailCategories)[number] | null;
      pendingOnly?: boolean | null;
      sortBy?: "latest" | "oldest" | "priority" | "sender" | null;
    }
  | {
      type: "compose";
      recipient?: string | null;
    };

type ChatResponse = {
  action: string;
  message: string;
  emails: Array<Record<string, unknown>>;
  uiAction?: ChatUiAction | null;
};

const plannerToolIds = [
  "answer_from_inbox",
  "answer_analytics",
  "mailbox_status",
  "notification_action",
  "project_help",
  "summarize_inbox",
  "list_senders",
  "open_emails",
  "navigate",
  "sync_inbox",
  "create_rule",
  "update_rule",
  "delete_rule",
  "assign_mailbox_owner",
  "approve_mail_access_request",
  "reject_mail_access_request",
  "create_scheduled_email",
  "delete_emails_by_sender",
  "clarify",
] as const;

const plannerSchema = z.object({
  tool: z.enum(plannerToolIds),
  reason: z.string().trim().min(1).default(""),
});

type PlannerToolId = (typeof plannerToolIds)[number];

type ToolContext = {
  message: string;
  normalized: string;
  scope: InboxChatScope;
  history: ChatHistoryEntry[];
};

type ToolResult = ChatResponse;
type PendingWorkflow = "create_rule" | "create_scheduled_email" | "assign_mailbox_owner" | null;

function buildScopedQuery(scope: InboxChatScope, extra: Record<string, unknown> = {}) {
  return {
    userId: scope.userId,
    ...(scope.accountId ? { accountId: scope.accountId } : {}),
    status: "active",
    ...extra,
  };
}

function buildRecentHistoryText(history: ChatHistoryEntry[]) {
  return history
    .slice(-6)
    .map((entry) => `${entry.role}: ${entry.message}`)
    .join("\n");
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isInformationRequest(normalized: string) {
  return (
    /\?$/.test(normalized) ||
    /\b(total|count|number of|how many|summary|summarize|give summary|what is|which|tell me|show me the count|list|give me|show me)\b/.test(
      normalized
    )
  );
}

function isInstructionRequest(normalized: string) {
  return /\b(how|steps|step by step|guide|process|how do i|how can i|where can i)\b/.test(normalized);
}

function isProjectQuestion(normalized: string) {
  return /\b(project|mailpilot|feature|features|section|sections|page|pages|workflow|workflows|what can you do|what can i do)\b/.test(
    normalized
  );
}

function extractComposeRecipient(normalized: string) {
  if (!/^compose |^write to |^email /.test(normalized)) {
    return null;
  }

  const recipient = normalized
    .replace(/^(compose|write to|email)\s+/, "")
    .replace(/^(mail\s+to|email\s+to|to)\s+/, "")
    .trim();

  return /^[^\s]+@[^\s]+\.[^\s]+$/.test(recipient) ? recipient : null;
}

function buildUserHistory(history: ChatHistoryEntry[]) {
  return history.filter((entry) => entry.role === "user").map((entry) => entry.message);
}

function getLastAssistantMessage(history: ChatHistoryEntry[]) {
  return [...history].reverse().find((entry) => entry.role === "assistant")?.message.toLowerCase() ?? "";
}

function inferPendingWorkflow(history: ChatHistoryEntry[], normalized: string): PendingWorkflow {
  const assistant = getLastAssistantMessage(history);

  if (
    /\b(create|make|add|save)\b/.test(normalized) && /\brule\b/.test(normalized) ||
    assistant.includes("what should i call the rule") ||
    assistant.includes("what should the rule match") ||
    assistant.includes("what should the rule do")
  ) {
    return "create_rule";
  }

  if (
    /\b(schedule|plan)\b/.test(normalized) && /\bemail\b/.test(normalized) ||
    assistant.includes("who should receive the email") ||
    assistant.includes("what subject should i use") ||
    assistant.includes("what should the email say") ||
    assistant.includes("when should i send it")
  ) {
    return "create_scheduled_email";
  }

  if (
    /\b(assign)\b/.test(normalized) && /\b(owner|mailbox)\b/.test(normalized) ||
    assistant.includes("which mailbox should i assign") ||
    assistant.includes("who should own that mailbox")
  ) {
    return "assign_mailbox_owner";
  }

  return null;
}

function extractRuleDetails(message: string) {
  const normalized = normalizeText(message);
  const name =
    normalized.match(/rule name\s+(.+?)(?=\s+(sender contains?|subject contains?|priority|category|auto archive|save|update|change)\b|$)/)?.[1]?.trim() ??
    "";
  const senderContains =
    normalized.match(/sender contains?\s+(.+?)(?=\s+(subject contains?|priority|category|auto archive|save|update|change)\b|$)/)?.[1]?.trim() ??
    "";
  const subjectContains =
    normalized.match(/subject contains?\s+(.+?)(?=\s+(sender contains?|priority|category|auto archive|save|update|change)\b|$)/)?.[1]?.trim() ??
    "";
  const priority = normalized.match(/\bpriority\s+(low|medium|high)\b/)?.[1] as
    | "low"
    | "medium"
    | "high"
    | undefined;
  const category = normalized.match(
    /\bcategory\s+(work|personal|spam|finance|promotions|updates|other)\b/
  )?.[1] as (typeof canonicalEmailCategories)[number] | undefined;
  const autoArchive = /\bauto archive\b|\bauto archieve\b|\barchive it\b|\barchieve it\b|\barchive\b|\barchieve\b/.test(normalized);

  if (!name && !senderContains && !subjectContains) {
    return null;
  }

  return {
    name,
    senderContains: senderContains || null,
    subjectContains: subjectContains || null,
    setPriority: priority ?? null,
    setCategory: category ?? null,
    autoArchive,
  };
}

function getPromptedUserAnswer(
  history: ChatHistoryEntry[],
  matcher: (assistantMessage: string) => boolean
) {
  for (let index = history.length - 2; index >= 0; index -= 1) {
    const prompt = history[index];
    const answer = history[index + 1];
    if (
      prompt?.role === "assistant" &&
      answer?.role === "user" &&
      matcher(prompt.message.toLowerCase())
    ) {
      return answer.message.trim();
    }
  }

  return "";
}

function extractRuleDetailsFromConversation(message: string, history: ChatHistoryEntry[]) {
  const combined = [...buildUserHistory(history), message].join(" ");
  const parsed = extractRuleDetails(combined) ?? {
    name: "",
    senderContains: null,
    subjectContains: null,
    setPriority: null,
    setCategory: null,
    autoArchive: false,
  };
  const lastAssistant = getLastAssistantMessage(history);
  const rawCurrent = message.trim();
  const current = normalizeText(message);
  const promptedName = getPromptedUserAnswer(history, (assistantMessage) =>
    assistantMessage.includes("what should i call the rule")
  );

  if (promptedName) {
    parsed.name = promptedName.replace(/^name\s+/i, "").trim();
  }

  if (!parsed.name && lastAssistant.includes("what should i call the rule")) {
    parsed.name = rawCurrent.replace(/^name\s+/i, "").trim();
  }

  if (!parsed.senderContains && !parsed.subjectContains && lastAssistant.includes("what should the rule match")) {
    if (!/\bsender contains?\b|\bsubject contains?\b/.test(current)) {
      parsed.senderContains = current.trim() || null;
    }
  }

  return parsed;
}

function extractRuleReference(normalized: string) {
  return (
    normalized.match(/\brule\s+name\s+(.+)$/)?.[1]?.trim() ??
    normalized.match(/\b(?:delete|remove|update|edit|change)\s+rule\s+(.+)$/)?.[1]?.trim() ??
    ""
  );
}

function extractMailboxOwnerAssignment(normalized: string) {
  const mailboxEmail =
    normalized.match(/\bmailbox\s+([^\s]+@[^\s]+)\b/)?.[1]?.trim() ??
    normalized.match(/\bowner\s+(?:for|of)\s+([^\s]+@[^\s]+)\b/)?.[1]?.trim() ??
    "";
  const userRef =
    normalized.match(/\bto\s+([^\s]+@[^\s]+)\b/)?.[1]?.trim() ??
    normalized.match(/\bto\s+([a-z0-9._ -]+)$/i)?.[1]?.trim() ??
    "";

  if (!mailboxEmail || !userRef) {
    return null;
  }

  return { mailboxEmail, userRef };
}

function extractMailboxOwnerAssignmentFromConversation(message: string, history: ChatHistoryEntry[]) {
  const combined = [...buildUserHistory(history), message].join(" ");
  const parsed = extractMailboxOwnerAssignment(normalizeText(combined)) ?? {
    mailboxEmail: "",
    userRef: "",
  };
  const lastAssistant = getLastAssistantMessage(history);
  const current = normalizeText(message);

  if (!parsed.mailboxEmail && lastAssistant.includes("which mailbox should i assign")) {
    parsed.mailboxEmail = extractSenderEmail(current);
  }

  if (!parsed.userRef && lastAssistant.includes("who should own that mailbox")) {
    parsed.userRef = current.trim();
  }

  return parsed;
}

function extractRequestEmail(normalized: string) {
  return (
    normalized.match(/\bfor\s+([^\s]+@[^\s]+)\b/)?.[1]?.trim() ??
    normalized.match(/\brequest\s+([^\s]+@[^\s]+)\b/)?.[1]?.trim() ??
    ""
  );
}

function extractScheduledEmail(normalizedMessage: string) {
  const toMatch = normalizedMessage.match(/\b(?:schedule|create|send)\s+(?:an?\s+)?email\s+to\s+([^\s]+@[^\s]+)\b/i);
  const subjectMatch = normalizedMessage.match(/\bsubject\s+(.+?)(?=\s+\b(body|message|at|on)\b|$)/i);
  const bodyMatch = normalizedMessage.match(/\b(?:body|message)\s+(.+?)(?=\s+\b(at|on)\b|$)/i);
  const atMatch = normalizedMessage.match(/\bat\s+(\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2})/i);

  if (!toMatch) {
    return null;
  }

  return {
    recipient: toMatch[1].trim(),
    subject: subjectMatch?.[1]?.trim() ?? "",
    body: bodyMatch?.[1]?.trim() ?? "",
    scheduledAt: atMatch?.[1]?.replace(" ", "T") ?? "",
  };
}

function extractScheduledEmailFromConversation(message: string, history: ChatHistoryEntry[]) {
  const combined = [...buildUserHistory(history), message].join(" ");
  const parsed = extractScheduledEmail(combined) ?? {
    recipient: "",
    subject: "",
    body: "",
    scheduledAt: "",
  };
  const lastAssistant = getLastAssistantMessage(history);
  const current = message.trim();
  const normalizedCurrent = normalizeText(message);

  if (!parsed.recipient && lastAssistant.includes("who should receive the email")) {
    parsed.recipient = extractSenderEmail(normalizedCurrent);
  }

  if (!parsed.subject && lastAssistant.includes("what subject should i use")) {
    parsed.subject = current;
  }

  if (!parsed.body && lastAssistant.includes("what should the email say")) {
    parsed.body = current;
  }

  if (!parsed.scheduledAt && lastAssistant.includes("when should i send it")) {
    const atMatch = current.match(/(\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2})/i);
    parsed.scheduledAt = atMatch?.[1]?.replace(" ", "T") ?? "";
  }

  return parsed;
}

function extractSenderEmail(normalized: string) {
  return normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.trim().toLowerCase() ?? "";
}

function buildProjectGuide(normalized: string) {
  if (/\b(dashboard|overview)\b/.test(normalized)) {
    return "Overview shows mailbox health, processed counts, pending replies, top senders, and shortcuts into insights or sync history. Use it to see what needs attention first.";
  }
  if (/\b(emails|inbox|workspace)\b/.test(normalized)) {
    return "Emails is the main triage workspace. Use filters, sender lists, thread view, reply actions, and bulk actions to review or clean the inbox.";
  }
  if (/\b(compose|draft|scheduled email|outbox)\b/.test(normalized)) {
    return "Compose is used for new emails, saved templates, and scheduled sends. You can prefill a recipient, reuse templates, or plan emails for later delivery.";
  }
  if (/\b(insights|sender insights|rules)\b/.test(normalized)) {
    return "Sender Insights shows top senders, response rate, and automation opportunities. Create rules there to categorize, reprioritize, or archive repeat senders.";
  }
  if (/\b(sync history|sync)\b/.test(normalized)) {
    return "Sync History tracks each inbox run with fetched, processed, skipped, failed counts, timing, and failure reasons. Use it to verify sync health and troubleshoot issues.";
  }
  if (/\b(mail access|approval|request)\b/.test(normalized)) {
    return "Mail access handles restricted Gmail mailboxes. Users verify ownership with Google, admins approve requests, and approved mailboxes become ready to connect and sync.";
  }
  if (/\b(team|owner|reviewer|role)\b/.test(normalized)) {
    return "Team management is where admins assign mailbox owners, reviewers, and roles. Use it to define who manages each mailbox internally.";
  }
  if (/\b(audit|compliance)\b/.test(normalized)) {
    return "Audit Center centralizes sync runs, approvals, replies, failures, and admin actions. Use it when you need traceability or operational review.";
  }
  if (/\b(chat|chatbot|assistant)\b/.test(normalized)) {
    return "The chatbot can answer inbox questions, open sections, run filters, create rules, assign owners, approve requests, schedule emails, manage notifications, and perform other supported actions across the product.";
  }
  if (/\b(tutorial|help)\b/.test(normalized)) {
    return "Tutorial explains setup, key pages, and common tasks. Use it when a user needs guided steps instead of a direct action.";
  }

  return "SK MailPilot covers mailbox sync, inbox triage, sender insights, rules, compose and scheduling, approvals, audit, team ownership, notifications, and chatbot-driven actions. Ask for a section, a metric, or an action and MailPilot will either perform it or tell you the next required step.";
}

async function buildSenderAnswer(scope: InboxChatScope, normalized: string): Promise<ChatResponse | null> {
  if (!/\b(list|show|give)\b/.test(normalized) || !/\bsenders?\b/.test(normalized)) {
    return null;
  }

  const wantsAllSenders = /\ball\b/.test(normalized);
  const highPriorityOnly = /\bhigh\b/.test(normalized) && /\bpriority\b/.test(normalized);
  const query = buildScopedQuery(scope, highPriorityOnly ? { priority: "high" } : {});
  const emails = await EmailModel.find(query)
    .select({ sender: 1, priority: 1 })
    .lean();

  const counts = new Map<string, number>();
  for (const email of emails) {
    const sender = String(email.sender ?? "").trim().toLowerCase();
    if (!sender) {
      continue;
    }
    counts.set(sender, (counts.get(sender) ?? 0) + 1);
  }

  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  if (!ranked.length) {
    return {
      action: "answer",
      message: highPriorityOnly
        ? "No high priority sender list is available in the current inbox scope."
        : "No sender list is available in the current inbox scope.",
      emails: [],
    };
  }

  if (wantsAllSenders) {
    return {
      action: "answer",
      message: highPriorityOnly
        ? `All senders for high priority emails: ${ranked.map(([sender]) => sender).join(", ")}.`
        : `All senders in the current mailbox scope: ${ranked.map(([sender]) => sender).join(", ")}.`,
      emails: [],
    };
  }

  return {
    action: "answer",
    message: highPriorityOnly
      ? `Top senders for high priority emails: ${ranked
          .slice(0, 5)
          .map(([sender, count]) => `${sender} (${count})`)
          .join(", ")}.`
      : `Top senders: ${ranked
          .slice(0, 5)
          .map(([sender, count]) => `${sender} (${count})`)
          .join(", ")}.`,
    emails: [],
  };
}

async function answerAnalytics(scope: InboxChatScope, normalized: string): Promise<ToolResult> {
  const query = buildScopedQuery(scope);
  const [totalEmails, repliedCount, pendingReplies, highCount, mediumCount, lowCount, spamCount, archivedCount] =
    await Promise.all([
      EmailModel.countDocuments(query),
      EmailModel.countDocuments({ ...query, replyStatus: "sent" }),
      EmailModel.countDocuments({ ...query, needsReply: true, replyStatus: { $ne: "sent" } }),
      EmailModel.countDocuments({ ...query, priority: "high" }),
      EmailModel.countDocuments({ ...query, priority: "medium" }),
      EmailModel.countDocuments({ ...query, priority: "low" }),
      EmailModel.countDocuments({ ...query, category: "spam" }),
      EmailModel.countDocuments(buildScopedQuery(scope, { status: "deleted" })),
    ]);

  const replyRate = totalEmails > 0 ? Math.round((repliedCount / totalEmails) * 100) : 0;
  const wantsRate = /\b(reply rate|reply coverage|response rate)\b/.test(normalized);

  if (wantsRate) {
    const senderEmails = await EmailModel.find(query).select({ sender: 1, reply: 1 }).lean();
    const senderStats = new Map<string, { total: number; replyable: number }>();
    for (const email of senderEmails) {
      const sender = String(email.sender ?? "").trim().toLowerCase();
      if (!sender) {
        continue;
      }
      const current = senderStats.get(sender) ?? { total: 0, replyable: 0 };
      current.total += 1;
      if (email.reply) {
        current.replyable += 1;
      }
      senderStats.set(sender, current);
    }
    const bestSenderEntry = Array.from(senderStats.entries())
      .map(([sender, stats]) => ({
        sender,
        rate: stats.total > 0 ? Math.round((stats.replyable / stats.total) * 100) : 0,
      }))
      .sort((left, right) => right.rate - left.rate)[0];

    return {
      action: "answer",
      message: bestSenderEntry
        ? `Your overall reply rate is ${replyRate}% based on ${repliedCount} sent replies across ${totalEmails} active emails. Best sender response rate is ${bestSenderEntry.rate}% for ${bestSenderEntry.sender}.`
        : `Your overall reply rate is ${replyRate}% based on ${repliedCount} sent replies across ${totalEmails} active emails.`,
      emails: [],
    };
  }

  if (/\bhigh\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${highCount} high priority emails in the current mailbox scope.`,
      emails: [],
    };
  }

  if (/\bmedium\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${mediumCount} medium priority emails in the current mailbox scope.`,
      emails: [],
    };
  }

  if (/\blow\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${lowCount} low priority emails in the current mailbox scope.`,
      emails: [],
    };
  }

  if (/\bspam|junk\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${spamCount} spam emails in the current mailbox scope.`,
      emails: [],
    };
  }

  if (/\b(archive|archieve|archived)\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${archivedCount} archived or removed emails in the current mailbox scope.`,
      emails: [],
    };
  }

  if (/\b(pending|follow.?up|repl(?:y|ies))\b/.test(normalized) && /\b(total|count|number of|how many)\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${pendingReplies} pending reply emails in the current mailbox scope.`,
      emails: [],
    };
  }

  return {
    action: "answer",
    message: `Mailbox metrics: ${totalEmails} total emails, ${replyRate}% reply rate, ${pendingReplies} pending replies, ${highCount} high priority, ${mediumCount} medium priority, ${lowCount} low priority, and ${spamCount} spam.`,
    emails: [],
  };
}

async function answerMailboxStatus(scope: InboxChatScope, normalized: string): Promise<ToolResult> {
  const [accounts, pendingRequests, approvedRequests] = await Promise.all([
    GmailAccountModel.find({ userId: scope.userId }).select({ email: 1, status: 1, isPrimary: 1 }).lean(),
    MailAccessRequestModel.countDocuments({ userId: scope.userId, status: "pending" }),
    MailAccessRequestModel.countDocuments({ userId: scope.userId, status: "approved" }),
  ]);

  if (/\bconnected\b|\bmailboxes\b|\bgmail accounts?\b|\bconnected mails?\b/.test(normalized)) {
    if (!accounts.length) {
      return {
        action: "answer",
        message: "No Gmail account is connected yet for this login.",
        emails: [],
      };
    }

    const summary = accounts
      .map((account) => `${String(account.email)} (${String(account.status)}${account.isPrimary ? ", primary" : ""})`)
      .join(", ");

    return {
      action: "answer",
      message: `Connected mailboxes: ${summary}.`,
      emails: [],
    };
  }

  if (/\bpending requests?\b|\bapproval status\b|\bapproved mails?\b/.test(normalized)) {
    return {
      action: "answer",
      message: `You have ${pendingRequests} pending mailbox request${pendingRequests === 1 ? "" : "s"} and ${approvedRequests} approved mailbox request${approvedRequests === 1 ? "" : "s"}.`,
      emails: [],
    };
  }

  return {
    action: "answer",
    message: `Mailbox status: ${accounts.length} connected mailbox${accounts.length === 1 ? "" : "es"}, ${pendingRequests} pending request${pendingRequests === 1 ? "" : "s"}, and ${approvedRequests} approved request${approvedRequests === 1 ? "" : "s"}.`,
    emails: [],
  };
}

async function handleNotificationAction(scope: InboxChatScope, normalized: string): Promise<ToolResult> {
  if (/\bmark\b/.test(normalized) && /\b(all )?notifications?\b/.test(normalized) && /\bread\b/.test(normalized)) {
    await NotificationModel.updateMany(
      {
        userId: scope.userId,
        readAt: null,
      },
      {
        $set: { readAt: new Date() },
      }
    );

    return {
      action: "notification_action",
      message: "All notifications have been marked as read.",
      emails: [],
    };
  }

  const notifications = await NotificationModel.find({ userId: scope.userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  const unreadCount = await NotificationModel.countDocuments({ userId: scope.userId, readAt: null });

  if (!notifications.length) {
    return {
      action: "answer",
      message: "No notifications are available right now.",
      emails: [],
    };
  }

  return {
    action: "answer",
    message: `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}. Recent notifications: ${notifications
      .map((item) => String(item.title))
      .join(", ")}.`,
    emails: [],
  };
}

async function answerProjectHelp(normalized: string): Promise<ToolResult> {
  return {
    action: "answer",
    message: buildProjectGuide(normalized),
    emails: [],
  };
}

async function summarizeInbox(scope: InboxChatScope): Promise<ToolResult> {
  const query = buildScopedQuery(scope);
  const emails = await EmailModel.find(query)
    .sort({ originalDate: -1, updatedAt: -1 })
    .limit(12)
    .lean();
  const totalEmails = await EmailModel.countDocuments(query);
  const highPriorityCount = await EmailModel.countDocuments({ ...query, priority: "high" });
  const spamCount = await EmailModel.countDocuments({ ...query, category: "spam" });
  const pendingReplies = await EmailModel.countDocuments({
    ...query,
    needsReply: true,
    replyStatus: { $ne: "sent" },
  });

  if (!emails.length) {
    return {
      action: "summarize",
      message: "Inbox is empty. Sync Gmail or process emails to build a summary.",
      emails: [],
    };
  }

  const fallback = `Inbox summary: ${totalEmails} total emails, ${pendingReplies} pending replies, ${highPriorityCount} high priority, and ${spamCount} spam. Recent subjects include ${emails
    .slice(0, 4)
    .map((email) => String(email.subject ?? "(No subject)"))
    .join(", ")}.`;

  const digest = emails
    .map(
      (email) =>
        `${String(email.subject ?? "")} | ${String(email.sender ?? "")} | ${String(
          getEmailCategoryLabel(email.category)
        )} | ${String(email.priority ?? "low")}`
    )
    .join("\n");

  const summary = await withLlmTimeout(
    llm.invoke([
      new SystemMessage(
        "You summarize mailbox state in short, direct plain English. Use only the provided facts."
      ),
      new HumanMessage(
        `Total emails: ${totalEmails}\nPending replies: ${pendingReplies}\nHigh priority: ${highPriorityCount}\nSpam: ${spamCount}\nRecent emails:\n${digest}`
      ),
    ]),
    "chatbot.summary",
    () => new AIMessage(fallback)
  );

  return {
    action: "summarize",
    message: typeof summary.content === "string" ? summary.content : fallback,
    emails: [],
  };
}

async function answerFromInbox(message: string, scope: InboxChatScope): Promise<ToolResult> {
  const query = buildScopedQuery(scope, {
    $or: [
      { subject: { $regex: message, $options: "i" } },
      { content: { $regex: message, $options: "i" } },
      { summary: { $regex: message, $options: "i" } },
      { sender: { $regex: message, $options: "i" } },
    ],
  });
  const emails = await EmailModel.find(query)
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  if (!emails.length) {
    return {
      action: "answer",
      message: "I could not find matching emails for that request in the current inbox data.",
      emails: [],
    };
  }

  const fallback = `I found ${emails.length} matching emails. Top matches: ${emails
    .slice(0, 5)
    .map((email) => `#${email.numericId} ${email.subject}`)
    .join(", ")}.`;
  const digest = emails
    .map(
      (email) =>
        `#${email.numericId} | ${email.subject} | ${email.sender} | ${getEmailCategoryLabel(email.category)} | ${email.priority}`
    )
    .join("\n");

  const answer = await withLlmTimeout(
    llm.invoke([
      new SystemMessage(
        "You answer inbox questions using only the provided email records. Be direct, short, and factual."
      ),
      new HumanMessage(`User request: ${message}\nMatching emails:\n${digest}`),
    ]),
    "chatbot.answer",
    () => new AIMessage(fallback)
  );

  return {
    action: "answer",
    message: typeof answer.content === "string" ? answer.content : fallback,
    emails,
  };
}

async function createRule(message: string, history: ChatHistoryEntry[], scope: InboxChatScope): Promise<ToolResult> {
  const details = extractRuleDetailsFromConversation(message, history);
  if (!details.name) {
    return {
      action: "clarify",
      message: "What should I call the rule?",
      emails: [],
    };
  }

  if (!details.senderContains && !details.subjectContains) {
    return {
      action: "clarify",
      message: "What should the rule match? For example: `sender contain noreply` or `subject contain invoice`.",
      emails: [],
    };
  }

  if (!details.setPriority && !details.setCategory && !details.autoArchive) {
    return {
      action: "clarify",
      message: "What should the rule do? You can set a priority, set a category, or enable auto-archive.",
      emails: [],
    };
  }

  const rule = await InboxRuleModel.create({
    userId: scope.userId,
    name: details.name,
    senderContains: details.senderContains,
    subjectContains: details.subjectContains,
    bodyContains: null,
    setPriority: details.setPriority,
    setCategory: details.setCategory,
    markNeedsReply: null,
    autoArchive: details.autoArchive,
    active: true,
  });

  return {
    action: "create_rule",
    message: `Rule created: ${rule.name}.`,
    emails: [],
    uiAction: { type: "navigate", route: "sender-insights" },
  };
}

async function updateRule(message: string): Promise<ToolResult> {
  const normalized = normalizeText(message);
  const details = extractRuleDetails(message);
  const ruleRef = extractRuleReference(normalized) || details?.name || "";

  if (!ruleRef || !details) {
    return {
      action: "clarify",
      message:
        "Use this format to update a rule: `update rule finance-filter sender contain noreply priority low`.",
      emails: [],
    };
  }

  const rule = await InboxRuleModel.findOne({ name: new RegExp(`^${ruleRef}$`, "i") });
  if (!rule) {
    return {
      action: "update_rule",
      message: `I could not find a rule named ${ruleRef}.`,
      emails: [],
    };
  }

  rule.name = details.name || rule.name;
  rule.senderContains = details.senderContains ?? rule.senderContains;
  rule.subjectContains = details.subjectContains ?? rule.subjectContains;
  rule.setPriority = details.setPriority ?? rule.setPriority;
  rule.setCategory = details.setCategory ?? rule.setCategory;
  rule.autoArchive = details.autoArchive || rule.autoArchive;
  await rule.save();

  return {
    action: "update_rule",
    message: `Rule updated: ${rule.name}.`,
    emails: [],
    uiAction: { type: "navigate", route: "sender-insights" },
  };
}

async function deleteRule(normalized: string): Promise<ToolResult> {
  const ruleRef = extractRuleReference(normalized);
  if (!ruleRef) {
    return {
      action: "clarify",
      message: "Tell me which rule to delete, for example: `delete rule finance-filter`.",
      emails: [],
    };
  }

  const rule = await InboxRuleModel.findOne({ name: new RegExp(`^${ruleRef}$`, "i") });
  if (!rule) {
    return {
      action: "delete_rule",
      message: `I could not find a rule named ${ruleRef}.`,
      emails: [],
    };
  }

  await InboxRuleModel.deleteOne({ _id: rule._id });
  return {
    action: "delete_rule",
    message: `Rule deleted: ${rule.name}.`,
    emails: [],
    uiAction: { type: "navigate", route: "sender-insights" },
  };
}

async function assignMailboxOwner(message: string, history: ChatHistoryEntry[]): Promise<ToolResult> {
  const parsed = extractMailboxOwnerAssignmentFromConversation(message, history);
  if (!parsed.mailboxEmail) {
    return {
      action: "clarify",
      message: "Which mailbox should I assign? Send the mailbox email address.",
      emails: [],
    };
  }

  if (!parsed.userRef) {
    return {
      action: "clarify",
      message: "Who should own that mailbox? Send a user email or exact team member name.",
      emails: [],
    };
  }

  const mailbox = await GmailAccountModel.findOne({ email: parsed.mailboxEmail.toLowerCase() });
  if (!mailbox) {
    return {
      action: "assign_mailbox_owner",
      message: `I could not find a mailbox for ${parsed.mailboxEmail}.`,
      emails: [],
    };
  }

  const user = await UserModel.findOne({
    $or: [
      { email: parsed.userRef.toLowerCase() },
      { name: new RegExp(`^${parsed.userRef}$`, "i") },
    ],
  });

  if (!user) {
    return {
      action: "assign_mailbox_owner",
      message: `I could not find a team user matching ${parsed.userRef}.`,
      emails: [],
    };
  }

  mailbox.ownerUserId = user._id;
  await mailbox.save();

  return {
    action: "assign_mailbox_owner",
    message: `Mailbox owner updated: ${mailbox.email} is now assigned to ${user.name}.`,
    emails: [],
    uiAction: { type: "navigate", route: "team" },
  };
}

async function approveOrRejectRequest(normalized: string, status: "approved" | "rejected"): Promise<ToolResult> {
  const requestEmail = extractRequestEmail(normalized);
  if (!requestEmail) {
    return {
      action: "clarify",
      message: `Tell me which mailbox request to ${status === "approved" ? "approve" : "reject"}, for example: \`${status === "approved" ? "approve" : "reject"} request for mailbox@example.com\`.`,
      emails: [],
    };
  }

  const request = await MailAccessRequestModel.findOne({
    requestedAccountEmail: requestEmail.toLowerCase(),
    status: status === "approved" ? "pending" : "pending",
  });

  if (!request) {
    return {
      action: status === "approved" ? "approve_mail_access_request" : "reject_mail_access_request",
      message: `I could not find a mailbox request for ${requestEmail}.`,
      emails: [],
    };
  }

  if (status === "approved") {
    request.status = "approved";
    request.approvedAt = new Date();
  } else {
    await MailAccessRequestModel.deleteOne({ _id: request._id });
  }

  if (status === "approved") {
    await request.save();
  }

  return {
    action: status === "approved" ? "approve_mail_access_request" : "reject_mail_access_request",
    message: `Mailbox request ${status === "approved" ? "approved" : "rejected"} for ${requestEmail}.`,
    emails: [],
    uiAction: { type: "navigate", route: "mail-access" },
  };
}

async function createScheduledEmailFromChat(message: string, scope: InboxChatScope, history: ChatHistoryEntry[]): Promise<ToolResult> {
  const parsed = extractScheduledEmailFromConversation(message, history);
  if (!parsed.recipient) {
    return {
      action: "clarify",
      message: "Who should receive the email? Send the recipient email address.",
      emails: [],
    };
  }

  if (!parsed.subject) {
    return {
      action: "clarify",
      message: "What subject should I use for the scheduled email?",
      emails: [],
    };
  }

  if (!parsed.body) {
    return {
      action: "clarify",
      message: "What should the email say?",
      emails: [],
    };
  }

  if (!parsed.scheduledAt) {
    return {
      action: "clarify",
      message: "When should I send it? Use `YYYY-MM-DD HH:mm`.",
      emails: [],
    };
  }

  await ScheduledEmailModel.create({
    userId: scope.userId,
    accountId: scope.accountId ?? null,
    recipients: [parsed.recipient],
    cc: [],
    bcc: [],
    subject: parsed.subject,
    body: parsed.body,
    htmlBody: null,
    tone: "professional",
    status: "scheduled",
    timezone: "Asia/Calcutta",
    scheduledAt: new Date(parsed.scheduledAt),
    nextRunAt: new Date(parsed.scheduledAt),
    recurrence: {
      frequency: "none",
      interval: 1,
      dayOfWeek: null,
      dayOfMonth: null,
    },
    attachments: [],
  });

  return {
    action: "create_scheduled_email",
    message: `Scheduled email created for ${parsed.recipient} at ${parsed.scheduledAt}.`,
    emails: [],
    uiAction: { type: "navigate", route: "compose" },
  };
}

async function deleteEmailsBySenderFromChat(normalized: string, scope: InboxChatScope): Promise<ToolResult> {
  const sender = extractSenderEmail(normalized);
  if (!sender) {
    return {
      action: "delete_emails_by_sender",
      message: "Tell me which sender to delete, for example: `delete all mails from sender@example.com`.",
      emails: [],
    };
  }

  const query = buildScopedQuery(scope, { sender });
  const emails = await EmailModel.find(query);

  if (!emails.length) {
    return {
      action: "delete_emails_by_sender",
      message: `I could not find active emails from ${sender} in the current mailbox scope.`,
      emails: [],
    };
  }

  for (const email of emails) {
    email.status = "deleted";
    email.processedAt = new Date();
    await email.save();

    if (email.messageId) {
      await trashMessageFromGmail(email.messageId, email.accountId ? String(email.accountId) : null);
    }
  }

  return {
    action: "delete_emails_by_sender",
    message: `Deleted ${emails.length} emails from ${sender}.`,
    emails: [],
  };
}

async function syncInboxFromChat(scope: InboxChatScope): Promise<ToolResult> {
  const result = await syncInboxToDatabase({
    userId: scope.userId,
    accountId: scope.accountId ?? null,
  });

  return {
    action: "sync_inbox",
    message: `Fetched ${result.fetchedCount} emails from Gmail and saved ${result.processedCount} new emails.`,
    emails: [],
    uiAction: { type: "navigate", route: "emails" },
  };
}

function fallbackTool(normalized: string, history: ChatHistoryEntry[]): PlannerToolId {
  const recentHistoryText = history.map((entry) => entry.message.toLowerCase()).join(" ");
  const pendingWorkflow = inferPendingWorkflow(history, normalized);

  if (pendingWorkflow) {
    return pendingWorkflow;
  }

  if (/\b(delete|remove)\b/.test(normalized) && /\brule\b/.test(normalized)) {
    return "delete_rule";
  }
  if (/\b(update|edit|change)\b/.test(normalized) && /\brule\b/.test(normalized)) {
    return "update_rule";
  }
  if (
    (/\b(save this rule|create( a)? rule|make( a)? rule|add( a)? rule|rule name)\b/.test(normalized) ||
      /\b(rule details|create a rule|send me the rule details)\b/.test(recentHistoryText)) &&
    /(\brule\b|\bsender contain\b|\bsubject contain\b)/.test(normalized)
  ) {
    return "create_rule";
  }
  if (/\bassign\b/.test(normalized) && /\b(mailbox|owner)\b/.test(normalized)) {
    return "assign_mailbox_owner";
  }
  if (/\bapprove\b/.test(normalized) && /\brequest\b/.test(normalized)) {
    return "approve_mail_access_request";
  }
  if (/\breject\b/.test(normalized) && /\brequest\b/.test(normalized)) {
    return "reject_mail_access_request";
  }
  if ((/\b(schedule|create|send)\b/.test(normalized) && /\bemail\b/.test(normalized)) || /\bschedule an? email\b/.test(normalized)) {
    return "create_scheduled_email";
  }
  if (/\b(delete|remove)\b/.test(normalized) && /\b(mail|email|messages?)\b/.test(normalized) && Boolean(extractSenderEmail(normalized))) {
    return "delete_emails_by_sender";
  }
  if (
    /\b(reply rate|reply coverage|response rate)\b/.test(normalized) ||
    (isInformationRequest(normalized) &&
      /\b(total|count|number of|how many)\b/.test(normalized) &&
      /\b(high|medium|low|spam|junk|archive|archieve|archived|pending|follow.?up|repl(?:y|ies))\b/.test(normalized))
  ) {
    return "answer_analytics";
  }
  if (/\b(notification|notifications)\b/.test(normalized)) {
    return "notification_action";
  }
  if (/\b(connected mailboxes|connected mails|gmail accounts?|mailbox status|approval status|approved mails?|pending requests?)\b/.test(normalized)) {
    return "mailbox_status";
  }
  if (/\b(sync|refresh|fetch)\b/.test(normalized) && /\b(inbox|mail|emails?)\b/.test(normalized)) {
    return "sync_inbox";
  }
  if (/^compose |^write to |^email /.test(normalized)) {
    return "navigate";
  }
  if (/\b(list|show|give)\b/.test(normalized) && /\bsenders?\b/.test(normalized)) {
    return "list_senders";
  }
  if (/\bsummary|summarize|give summary\b/.test(normalized) && /\b(mail|mails|email|emails|inbox)\b/.test(normalized)) {
    return "summarize_inbox";
  }
  if (/\bfinance|invoice|billing|payment\b/.test(normalized)) {
    return "open_emails";
  }
  if (/\b(pending|follow.?up|replies?)\b/.test(normalized)) {
    return "open_emails";
  }
  if (/\b(low|medium|high|urgent|critical)\b/.test(normalized) && /\b(priority|mail|email|inbox|messages)\b/.test(normalized)) {
    return "open_emails";
  }
  if (/\b(promotions?|newsletter|updates?|work|personal|spam|junk)\b/.test(normalized)) {
    return "open_emails";
  }
  if (/\b(insights|rules?)\b/.test(normalized)) {
    return isInformationRequest(normalized) || isInstructionRequest(normalized)
      ? "clarify"
      : "navigate";
  }
  if (/\b(requests?|approval|mail access)\b/.test(normalized)) {
    return "navigate";
  }
  if (/\b(audit|compliance|logs?)\b/.test(normalized)) {
    return "navigate";
  }
  if (/\b(team|owner|reviewer|roles?)\b/.test(normalized)) {
    return "navigate";
  }
  if (/\b(dashboard|overview|chatbot|chat)\b/.test(normalized)) {
    return isInstructionRequest(normalized) || isProjectQuestion(normalized) ? "project_help" : "navigate";
  }
  if (/\b(tutorial|help|guide|how to)\b/.test(normalized)) {
    return isInstructionRequest(normalized) || isProjectQuestion(normalized) ? "project_help" : "navigate";
  }
  if (isProjectQuestion(normalized) || isInstructionRequest(normalized)) {
    return "project_help";
  }
  if (/\b(emails?|inbox|messages)\b/.test(normalized)) {
    return isInformationRequest(normalized) ? "answer_from_inbox" : "open_emails";
  }
  return isInformationRequest(normalized) ? "answer_from_inbox" : "clarify";
}

async function selectTool(context: ToolContext): Promise<PlannerToolId> {
  const fallback = fallbackTool(context.normalized, context.history);
  const obviousTools = new Set<PlannerToolId>([
    "create_rule",
    "update_rule",
    "delete_rule",
    "assign_mailbox_owner",
    "approve_mail_access_request",
    "reject_mail_access_request",
    "create_scheduled_email",
    "delete_emails_by_sender",
    "answer_analytics",
    "mailbox_status",
    "notification_action",
    "list_senders",
    "summarize_inbox",
    "sync_inbox",
    "open_emails",
    "navigate",
    "project_help",
  ]);

  if (obviousTools.has(fallback)) {
    return fallback;
  }

  const historyText = buildRecentHistoryText(context.history);
  const planner = llm.withStructuredOutput(plannerSchema, { name: "mailpilot_chat_tool_plan" });

  const result = await withLlmTimeout(
    planner.invoke([
      new SystemMessage(
        [
          "Choose the best tool for the user's MailPilot request.",
          `Available tools: ${plannerToolIds.join(", ")}.`,
          "Use list_senders for sender list requests.",
          "Use open_emails for requests that should change inbox filters or open filtered inbox views.",
          "Use answer_analytics for reply rate, counts, or mailbox metrics questions.",
          "Use mailbox_status for connected mailboxes, approval status, or mailbox readiness questions.",
          "Use notification_action for reading or marking notifications.",
          "Use project_help for feature explanations, section guidance, and whole-product help.",
          "Use navigate for page navigation like tutorial, insights, requests, audit, team, compose.",
          "Use summarize_inbox for high-level mailbox summary requests.",
          "Use answer_from_inbox for direct questions about inbox data.",
          "Use create_rule, update_rule, delete_rule for rule mutations.",
          "Use assign_mailbox_owner, approve_mail_access_request, reject_mail_access_request, create_scheduled_email for those exact actions.",
          "Use delete_emails_by_sender when the user asks to delete all emails from a specific sender.",
          "Use clarify if the request is incomplete and needs one short next-step instruction.",
        ].join(" ")
      ),
      new HumanMessage(`Chat history:\n${historyText || "none"}\n\nUser request:\n${context.message}`),
    ]),
    "chatbot.selectTool",
    () => ({ tool: fallback, reason: "Fallback tool selection" })
  );

  return plannerSchema.parse(result).tool;
}

function buildEmailUiAction(normalized: string): ChatUiAction {
  if (/\bfinance|invoice|billing|payment\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "finance" };
  }
  if (/\b(pending|follow.?up|replies?)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, pendingOnly: true };
  }
  if (/\bhigh|urgent|critical\b/.test(normalized) && /\b(priority|mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, priority: "high" };
  }
  if (/\blow\b/.test(normalized) && /\b(priority|mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, priority: "low" };
  }
  if (/\bmedium\b/.test(normalized) && /\b(priority|mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, priority: "medium" };
  }
  if (/\bpromotions?|newsletter\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "promotions" };
  }
  if (/\bupdates?\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "updates" };
  }
  if (/\bwork\b/.test(normalized) && /\b(mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "work" };
  }
  if (/\bpersonal\b/.test(normalized) && /\b(mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "personal" };
  }
  if (/\bspam|junk\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, category: "spam" };
  }
  if (/\brecent|latest|new\b/.test(normalized) && /\b(mail|email|inbox|messages)\b/.test(normalized)) {
    return { type: "open_emails", clearFilters: true, sortBy: "latest" };
  }
  return { type: "navigate", route: "emails" };
}

function buildNavigateUiAction(normalized: string): ChatUiAction {
  const recipient = extractComposeRecipient(normalized);
  if (recipient) {
    return { type: "compose", recipient };
  }
  if (/dashboard|overview/.test(normalized)) {
    return { type: "navigate", route: "dashboard" };
  }
  if (/chatbot|chat|assistant/.test(normalized)) {
    return { type: "navigate", route: "chatbot" };
  }
  if (/tutorial|help|guide|how to/.test(normalized)) {
    return { type: "navigate", route: "tutorial" };
  }
  if (/insights|rules?/.test(normalized)) {
    return { type: "navigate", route: "sender-insights" };
  }
  if (/requests?|approval|mail access/.test(normalized)) {
    return { type: "navigate", route: "mail-access" };
  }
  if (/audit|compliance|logs?/.test(normalized)) {
    return { type: "navigate", route: "audit-center" };
  }
  if (/team|owner|reviewer|roles?/.test(normalized)) {
    return { type: "navigate", route: "team" };
  }
  if (/compose|draft|write|send/.test(normalized)) {
    return { type: "navigate", route: "compose" };
  }
  return { type: "navigate", route: "emails" };
}

async function runTool(tool: PlannerToolId, context: ToolContext): Promise<ToolResult> {
  switch (tool) {
    case "list_senders": {
      const response = await buildSenderAnswer(context.scope, context.normalized);
      return response ?? { action: "answer", message: "No sender list is available.", emails: [] };
    }
    case "project_help":
      return answerProjectHelp(context.normalized);
    case "mailbox_status":
      return answerMailboxStatus(context.scope, context.normalized);
    case "notification_action":
      return handleNotificationAction(context.scope, context.normalized);
    case "summarize_inbox":
      return summarizeInbox(context.scope);
    case "answer_from_inbox":
      return answerFromInbox(context.message, context.scope);
    case "answer_analytics":
      return answerAnalytics(context.scope, context.normalized);
    case "create_rule":
      return createRule(context.message, context.history, context.scope);
    case "update_rule":
      return updateRule(context.message);
    case "delete_rule":
      return deleteRule(context.normalized);
    case "assign_mailbox_owner":
      return assignMailboxOwner(context.message, context.history);
    case "approve_mail_access_request":
      return approveOrRejectRequest(context.normalized, "approved");
    case "reject_mail_access_request":
      return approveOrRejectRequest(context.normalized, "rejected");
    case "create_scheduled_email":
      return createScheduledEmailFromChat(context.message, context.scope, context.history);
    case "delete_emails_by_sender":
      return deleteEmailsBySenderFromChat(context.normalized, context.scope);
    case "sync_inbox":
      return syncInboxFromChat(context.scope);
    case "open_emails":
      return {
        action: "open_emails",
        message: "Opening the requested email view.",
        emails: [],
        uiAction: buildEmailUiAction(context.normalized),
      };
    case "navigate":
      return {
        action: "navigate",
        message: "Opening the requested section.",
        emails: [],
        uiAction: buildNavigateUiAction(context.normalized),
      };
    case "clarify":
      if (/\brules?\b/.test(context.normalized) && isInstructionRequest(context.normalized)) {
        return {
          action: "clarify",
          message:
            "To create a rule: 1. Open Sender Insights. 2. Enter a rule name. 3. Add a sender or subject pattern. 4. Choose priority, category, or auto-archive. 5. Save the rule. You can also send me the rule details directly.",
          emails: [],
        };
      }
      if (/\binsights?\b/.test(context.normalized) && isInstructionRequest(context.normalized)) {
        return {
          action: "clarify",
          message:
            "Insights work in 3 steps: 1. Sync the inbox. 2. Open Sender Insights to review top senders and response rate. 3. Use those patterns to decide which senders should become rules or workflows.",
          emails: [],
        };
      }
      return {
        action: "clarify",
        message:
          "Tell me what you want to know or do in one line, for example: `show high priority emails`, `list top senders`, `approve request for mailbox@example.com`, or `schedule email to person@example.com subject Update body Status at 2026-05-02 10:30`.",
        emails: [],
      };
  }
}

export async function handleInboxChat(message: string, scope: InboxChatScope): Promise<ChatResponse> {
  const history = Array.isArray(scope.history) ? scope.history : [];
  const context: ToolContext = {
    message,
    normalized: normalizeText(message),
    scope,
    history,
  };

  const tool = await selectTool(context);
  return runTool(tool, context);
}
