import { getOptionalEnv } from "../config/env";

export const canonicalEmailCategories = [
  "work",
  "personal",
  "spam",
  "finance",
  "promotions",
  "updates",
  "other",
] as const;

export const persistedEmailCategories = [
  ...canonicalEmailCategories,
  "support",
  "job",
  "important",
] as const;

export const emailPriorities = ["low", "medium", "high"] as const;

export type EmailCategory = (typeof canonicalEmailCategories)[number];
export type PersistedEmailCategory = (typeof persistedEmailCategories)[number];
export type EmailPriority = (typeof emailPriorities)[number];

type EmailRule = {
  senderContains?: string;
  subjectContains?: string;
  contentContains?: string;
  category: EmailCategory;
  priority?: EmailPriority;
  needsReply?: boolean;
};

type EmailClassificationInput = {
  from: string;
  subject: string;
  body: string;
};

type EmailClassificationResult = {
  category: EmailCategory;
  priority: EmailPriority;
  needsReply: boolean;
  automationActions: string[];
  matchedRule?: EmailRule;
};

function parseEnvList(name: string) {
  return (getOptionalEnv(name) ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const defaultRules: EmailRule[] = [
  {
    senderContains: "noreply",
    category: "spam",
    priority: "low",
    needsReply: false,
  },
  {
    senderContains: "no-reply",
    category: "spam",
    priority: "low",
    needsReply: false,
  },
  {
    subjectContains: "invoice",
    category: "finance",
  },
  {
    subjectContains: "receipt",
    category: "finance",
  },
];

function includesKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function parseCustomRulesFromEnv() {
  const rawRules = getOptionalEnv("EMAIL_CATEGORY_RULES");
  if (!rawRules?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRules) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((rule): rule is Record<string, unknown> => typeof rule === "object" && rule !== null)
      .map((rule) => {
        const category = normalizeEmailCategory(rule.category);
        const priority = normalizeEmailPriority(rule.priority);

        return {
          senderContains:
            typeof rule.senderContains === "string" ? rule.senderContains.toLowerCase() : undefined,
          subjectContains:
            typeof rule.subjectContains === "string"
              ? rule.subjectContains.toLowerCase()
              : undefined,
          contentContains:
            typeof rule.contentContains === "string"
              ? rule.contentContains.toLowerCase()
              : undefined,
          category,
          priority,
          needsReply: typeof rule.needsReply === "boolean" ? rule.needsReply : undefined,
        } satisfies EmailRule;
      })
      .filter((rule) => Boolean(rule.category));
  } catch {
    return [];
  }
}

function getRules() {
  return [...defaultRules, ...parseCustomRulesFromEnv()];
}

function matchesRule(
  rule: EmailRule,
  normalized: { sender: string; subject: string; body: string }
) {
  if (rule.senderContains && !normalized.sender.includes(rule.senderContains)) {
    return false;
  }

  if (rule.subjectContains && !normalized.subject.includes(rule.subjectContains)) {
    return false;
  }

  if (rule.contentContains && !normalized.body.includes(rule.contentContains)) {
    return false;
  }

  return Boolean(rule.senderContains || rule.subjectContains || rule.contentContains);
}

export function normalizeEmailCategory(category: unknown): EmailCategory {
  switch (category) {
    case "support":
    case "job":
    case "important":
      return "work";
    case "work":
    case "personal":
    case "spam":
    case "finance":
    case "promotions":
    case "updates":
    case "other":
      return category;
    default:
      return "other";
  }
}

export function normalizeEmailPriority(priority: unknown): EmailPriority {
  switch (priority) {
    case "high":
    case "medium":
    case "low":
      return priority;
    case "urgent":
      return "high";
    default:
      return "low";
  }
}

export function comparePriority(left: EmailPriority, right: EmailPriority) {
  const rank = {
    low: 0,
    medium: 1,
    high: 2,
  } satisfies Record<EmailPriority, number>;

  return rank[left] >= rank[right] ? left : right;
}

function getSenderImportanceScore(sender: string) {
  const normalized = sender.toLowerCase();
  const vipSenders = parseEnvList("VIP_SENDERS");
  const vipDomains = parseEnvList("VIP_DOMAINS");

  if (vipSenders.some((value) => normalized.includes(value))) {
    return 3;
  }

  const domain = normalized.split("@")[1] ?? normalized;
  if (vipDomains.includes(domain)) {
    return 2;
  }

  if (/\b(ceo|founder|manager|director|hr|recruiter|client|boss)\b/i.test(normalized)) {
    return 2;
  }

  return 0;
}

export function buildCategoryMongoFilter(category: EmailCategory) {
  if (category === "work") {
    return {
      $in: ["work", "support", "job", "important"],
    };
  }

  return category;
}

export function getEmailCategoryLabel(category: unknown) {
  switch (normalizeEmailCategory(category)) {
    case "work":
      return "Work";
    case "personal":
      return "Personal";
    case "spam":
      return "Spam";
    case "finance":
      return "Finance";
    case "promotions":
      return "Promotions";
    case "updates":
      return "Updates";
    default:
      return "Other";
  }
}

export function classifyEmail(input: EmailClassificationInput): EmailClassificationResult {
  const normalized = {
    sender: input.from.trim().toLowerCase(),
    subject: input.subject.trim().toLowerCase(),
    body: input.body.trim().toLowerCase(),
  };
  const combined = `${normalized.subject} ${normalized.body}`;

  const matchedRule = getRules().find((rule) => matchesRule(rule, normalized));
  const automationActions: string[] = [];

  let category = matchedRule?.category ?? ("other" as EmailCategory);

  if (!matchedRule) {
    if (
      includesKeyword(combined, [
        "unsubscribe",
        "lottery",
        "winner",
        "free money",
        "click here",
        "claim prize",
      ])
    ) {
      category = "spam";
    } else if (
      includesKeyword(combined, [
        "invoice",
        "receipt",
        "payment",
        "billing",
        "refund",
        "bank",
        "tax",
        "salary",
        "reimbursement",
      ])
    ) {
      category = "finance";
      automationActions.push("Categorized as finance from invoice/payment keywords");
    } else if (
      includesKeyword(combined, [
        "sale",
        "discount",
        "offer",
        "promo",
        "promotion",
        "newsletter",
        "deal",
        "limited time",
      ])
    ) {
      category = "promotions";
      automationActions.push("Marked as promotion from marketing/newsletter keywords");
    } else if (
      includesKeyword(combined, [
        "update",
        "notification",
        "digest",
        "status",
        "alert",
        "statement",
        "shipment",
        "tracking",
        "verification",
        "otp",
      ])
    ) {
      category = "updates";
      automationActions.push("Categorized as update from notification/status keywords");
    } else if (
      includesKeyword(combined, [
        "meeting",
        "project",
        "client",
        "team",
        "support",
        "issue",
        "ticket",
        "interview",
        "application",
        "resume",
        "deadline",
        "office",
        "follow up",
      ])
    ) {
      category = "work";
      automationActions.push("Marked as work from project/support/job language");
    } else if (/(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|icloud\.com)$/i.test(normalized.sender)) {
      category = "personal";
      automationActions.push("Marked as personal from sender domain");
    }
  }

  const senderImportanceScore = getSenderImportanceScore(normalized.sender);
  let priorityScore = senderImportanceScore;

  if (
    /\b(urgent|asap|deadline|immediately|today|eod|action required|interview|personal request|critical)\b/i.test(
      combined
    )
  ) {
    priorityScore += 3;
  } else if (
    /\b(important|soon|follow up|reminder|review|approval|meeting|tomorrow)\b/i.test(combined)
  ) {
    priorityScore += 1;
  }

  if (category === "spam" || category === "promotions") {
    priorityScore -= 3;
  } else if (category === "updates") {
    priorityScore -= 2;
  }

  const priority = matchedRule?.priority
    ? matchedRule.priority
    : priorityScore >= 3
      ? "high"
      : priorityScore >= 1
        ? "medium"
        : "low";

  if (matchedRule?.category === "spam") {
    automationActions.push("Marked as spam from custom sender rule");
  }

  if (category === "work" && /\b(job|interview|application|resume|hiring)\b/i.test(combined)) {
    automationActions.push("Detected job-related email");
  }

  if (priority === "high") {
    automationActions.push("Raised to high priority from urgency/sender analysis");
  } else if (priority === "low" && ["promotions", "spam", "updates"].includes(category)) {
    automationActions.push("Lowered priority for low-action email");
  }

  const needsReply =
    matchedRule?.needsReply ??
    (!["spam", "promotions", "updates", "finance"].includes(category) &&
      !/\b(noreply|no-reply|do not reply|donotreply|mailer-daemon|notification only|newsletter|unsubscribe)\b/i.test(
        `${normalized.sender} ${combined}`
      ) &&
      /\b(reply|respond|can you|please confirm|let me know|schedule|interview|support|meeting|could you|would you|please share)\b/i.test(
        combined
      ));

  if (needsReply) {
    automationActions.push("Flagged for follow-up because a response appears required");
  }

  return {
    category,
    priority,
    needsReply,
    automationActions,
    matchedRule,
  };
}
