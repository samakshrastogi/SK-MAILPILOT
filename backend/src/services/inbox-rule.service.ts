import { InboxRuleModel } from "../models/inbox-rule.model";
import type { EmailCategory, EmailPriority } from "./email-classification.service";

type RuleAwareInput = {
  userId: string;
  sender: string;
  subject: string;
  content: string;
  category: EmailCategory;
  priority: EmailPriority;
  needsReply: boolean;
  automationActions?: string[];
};

export function buildReplySla(priority: EmailPriority, needsReply: boolean, originalDate?: Date | null) {
  if (!needsReply) {
    return {
      replyDueAt: null,
      replyRiskStatus: "none" as const,
    };
  }

  const baseDate = originalDate ? new Date(originalDate) : new Date();
  const replyDueAt = new Date(baseDate);
  const hoursToAdd = priority === "high" ? 4 : priority === "medium" ? 12 : 24;
  replyDueAt.setHours(replyDueAt.getHours() + hoursToAdd);

  const now = Date.now();
  const remainingMs = replyDueAt.getTime() - now;
  const riskWindowMs = Math.max(60 * 60 * 1000, hoursToAdd * 60 * 60 * 1000 * 0.25);

  return {
    replyDueAt,
    replyRiskStatus:
      remainingMs <= 0 ? ("overdue" as const) : remainingMs <= riskWindowMs ? ("at-risk" as const) : ("on-track" as const),
  };
}

export async function applyInboxRules(input: RuleAwareInput) {
  const rules = await InboxRuleModel.find({
    userId: input.userId,
    active: true,
  })
    .sort({ createdAt: 1 })
    .lean();

  let category = input.category;
  let priority = input.priority;
  let needsReply = input.needsReply;
  let archive = false;
  const automationActions = [...(input.automationActions ?? [])];
  const haystacks = {
    sender: input.sender.trim().toLowerCase(),
    subject: input.subject.trim().toLowerCase(),
    body: input.content.trim().toLowerCase(),
  };

  for (const rule of rules) {
    const matchesSender = !rule.senderContains || haystacks.sender.includes(rule.senderContains);
    const matchesSubject = !rule.subjectContains || haystacks.subject.includes(rule.subjectContains);
    const matchesBody = !rule.bodyContains || haystacks.body.includes(rule.bodyContains);

    if (!matchesSender || !matchesSubject || !matchesBody) {
      continue;
    }

    if (rule.setCategory) {
      category = rule.setCategory as EmailCategory;
    }
    if (rule.setPriority) {
      priority = rule.setPriority as EmailPriority;
    }
    if (typeof rule.markNeedsReply === "boolean") {
      needsReply = rule.markNeedsReply;
    }
    if (rule.autoArchive) {
      archive = true;
    }

    automationActions.push(`Rule applied: ${rule.name}`);
  }

  return {
    category,
    priority,
    needsReply,
    archive,
    automationActions,
  };
}
