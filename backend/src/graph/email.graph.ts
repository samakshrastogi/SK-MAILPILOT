import { END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { analyzeEmail } from "../agents/analyzer.agent";
import { generateReply } from "../agents/reply.agent";
import {
  canonicalEmailCategories,
  comparePriority,
  classifyEmail,
  emailPriorities,
} from "../services/email-classification.service";

export const emailInputSchema = z.object({
  subject: z.string().min(1, "subject is required"),
  from: z.string().min(1, "from is required"),
  body: z.string().min(1, "body is required"),
});

export const emailStateSchema = emailInputSchema.extend({
  category: z.enum(canonicalEmailCategories).default("other"),
  priority: z.enum(emailPriorities).default("low"),
  needsReply: z.boolean().default(false),
  summary: z.string().default(""),
  automationActions: z.array(z.string()).default([]),
  reply: z.string().nullable().default(null),
});

export type EmailAutomationInput = z.infer<typeof emailInputSchema>;
export type EmailAutomationState = z.infer<typeof emailStateSchema>;

function buildSummary(subject: string, body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return `${subject.trim()}: ${normalized.slice(0, 140)}`.trim();
}

export async function analyzeNode(state: EmailAutomationState) {
  const heuristic = classifyEmail({
    from: state.from,
    subject: state.subject,
    body: state.body,
  });
  const aiAnalysis = await analyzeEmail({
    from: state.from,
    subject: state.subject,
    body: state.body,
  });

  const category =
    heuristic.matchedRule ||
    ["spam", "finance", "promotions", "updates"].includes(heuristic.category)
      ? heuristic.category
      : aiAnalysis.category !== "other"
        ? aiAnalysis.category
        : heuristic.category;
  const priority = comparePriority(heuristic.priority, aiAnalysis.priority);
  const needsReply =
    !["spam", "promotions", "updates", "finance"].includes(heuristic.category) &&
    (heuristic.needsReply || aiAnalysis.needsReply);
  const summary =
    aiAnalysis.summary?.trim() && !aiAnalysis.summary.startsWith("Skipped LLM analysis")
      ? aiAnalysis.summary.trim()
      : buildSummary(state.subject, state.body);

  return {
    category,
    priority,
    needsReply,
    summary,
    automationActions: Array.from(
      new Set([...heuristic.automationActions, ...(needsReply ? ["Suggested reply generation"] : [])])
    ),
  } satisfies Partial<EmailAutomationState>;
}

export async function replyNode(state: EmailAutomationState) {
  const response = await generateReply(state);

  return {
    reply: response.reply,
  } satisfies Partial<EmailAutomationState>;
}

function shouldGenerateReply(state: EmailAutomationState) {
  return state.needsReply ? "replyNode" : END;
}

const emailWorkflow = new StateGraph({
  state: emailStateSchema,
  input: emailInputSchema,
  output: emailStateSchema,
})
  .addNode("analyzeNode", analyzeNode)
  .addNode("replyNode", replyNode)
  .addEdge(START, "analyzeNode")
  .addConditionalEdges("analyzeNode", shouldGenerateReply)
  .addEdge("replyNode", END)
  .compile();

export async function runEmailAutomation(input: EmailAutomationInput) {
  return emailWorkflow.invoke(input);
}
