import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { EmailModel } from "../models/email.model";
import { buildCategoryMongoFilter, canonicalEmailCategories } from "./email-classification.service";
import { llm, withLlmTimeout } from "./llm.service";

const semanticPlanSchema = z.object({
  category: z.enum(canonicalEmailCategories).nullable().default(null),
  priority: z.enum(["low", "medium", "high"]).nullable().default(null),
  needsReply: z.boolean().nullable().default(null),
  sender: z.string().nullable().default(null),
  topic: z.string().nullable().default(null),
  dateHint: z.enum(["today", "week", "month", "none"]).default("none"),
});

const semanticPlanner = llm.withStructuredOutput(semanticPlanSchema, {
  name: "semantic_email_search",
});

export async function semanticSearchEmails(
  query: string,
  limit = 20,
  scope: Record<string, unknown> = {}
) {
  const plan = await withLlmTimeout(
    semanticPlanner.invoke([
      new SystemMessage(
        [
          "You convert natural-language inbox search requests into structured email filters.",
          "Infer category, priority, whether a reply is needed, sender/domain, topic, and simple date hints.",
          "Use category=finance for money/invoice/payment requests.",
          "Use category=work for jobs, interviews, project work, or meetings.",
          "Use needsReply=true when the user asks for pending replies or waiting responses.",
        ].join(" ")
      ),
      new HumanMessage(query),
    ]),
    "semantic.search.plan",
    () => ({
      category: null,
      priority: null,
      needsReply: null,
      sender: null,
      topic: query,
      dateHint: "none" as const,
    })
  );

  const mongoQuery: Record<string, unknown> = {
    ...scope,
    status: "active",
  };

  if (plan.category) {
    mongoQuery.category = buildCategoryMongoFilter(plan.category);
  }
  if (plan.priority) {
    mongoQuery.priority = plan.priority;
  }
  if (plan.needsReply !== null) {
    mongoQuery.needsReply = plan.needsReply;
    if (plan.needsReply) {
      mongoQuery.replyStatus = { $ne: "sent" };
    }
  }
  if (plan.sender) {
    mongoQuery.sender = { $regex: plan.sender, $options: "i" };
  }

  if (plan.dateHint !== "none") {
    const now = new Date();
    const since = new Date(now);
    if (plan.dateHint === "today") {
      since.setHours(0, 0, 0, 0);
    } else if (plan.dateHint === "week") {
      since.setDate(now.getDate() - 7);
    } else if (plan.dateHint === "month") {
      since.setMonth(now.getMonth() - 1);
    }
    mongoQuery.originalDate = { $gte: since };
  }

  const candidateLimit = Math.max(limit * 3, 30);
  const candidates = await EmailModel.find(mongoQuery)
    .sort({ originalDate: -1, updatedAt: -1 })
    .limit(candidateLimit)
    .lean();

  const topic = (plan.topic ?? query).toLowerCase();
  const topicWords = topic.split(/\s+/).filter((word: string) => word.length > 2);

  const scored = candidates.map((email) => {
    const haystack = `${email.subject ?? ""} ${email.summary ?? ""} ${email.content ?? ""} ${email.sender ?? ""}`.toLowerCase();
    let score = 0;

    for (const word of topicWords) {
      if (haystack.includes(word)) {
        score += 2;
      }
    }

    if (plan.category && email.category === plan.category) {
      score += 3;
    }
    if (plan.priority && email.priority === plan.priority) {
      score += 2;
    }
    if (plan.needsReply && email.needsReply) {
      score += 2;
    }
    if (/money|invoice|payment|budget|amount/.test(topic) && /invoice|payment|amount|refund|billing/.test(haystack)) {
      score += 3;
    }
    if (/job|interview|resume|application|hiring/.test(topic) && /job|interview|resume|application|hiring/.test(haystack)) {
      score += 3;
    }
    if (/meeting|calendar|schedule/.test(topic) && /meeting|calendar|schedule|zoom|teams/.test(haystack)) {
      score += 3;
    }

    return {
      email,
      score,
    };
  });

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.email);
}
