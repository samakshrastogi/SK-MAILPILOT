import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { EmailAutomationState } from "../graph/email.graph";
import {
  canonicalEmailCategories,
  emailPriorities,
} from "../services/email-classification.service";
import {
  llm,
  llmEnabled,
  llmLimits,
  prepareEmailBodyForLlm,
  shouldSkipLlm,
  withLlmTimeout,
} from "../services/llm.service";

export const emailAnalysisSchema = z.object({
  category: z.enum(canonicalEmailCategories),
  priority: z.enum(emailPriorities),
  needsReply: z.boolean(),
  summary: z.string().min(1),
});

const analyzerModel = llm.withStructuredOutput(emailAnalysisSchema, {
  name: "email_analysis",
});

export async function analyzeEmail(
  state: Pick<EmailAutomationState, "subject" | "from" | "body">
) {
  const fallbackSummary = state.body.slice(0, 160).trim() || "No summary available.";

  if (!llmEnabled) {
    return {
      category: "other" as const,
      priority: "low" as const,
      needsReply: false,
      summary: fallbackSummary,
    };
  }

  if (shouldSkipLlm(state.body)) {
    return {
      category: "other" as const,
      priority: "low" as const,
      needsReply: false,
      summary: `Skipped LLM analysis because email body exceeded ${llmLimits.skipThresholdChars} characters. ${fallbackSummary}`,
    };
  }

  const preparedBody = prepareEmailBodyForLlm(state.body);

  return withLlmTimeout(
    analyzerModel.invoke([
      new SystemMessage(
        [
          "You are an email analysis agent for an automation backend.",
          "Return a short structured JSON result only.",
          "Classify the email, assign priority, decide whether it needs a reply, and write a concise summary.",
          "Use needsReply=false for spam, newsletters, receipts, and informational messages that do not ask for a response.",
          "Keep the summary under 30 words.",
          "Rely only on the email content you are given.",
        ].join(" ")
      ),
      new HumanMessage(
        [`From: ${state.from}`, `Subject: ${state.subject}`, "Body:", preparedBody].join(
          "\n"
        )
      ),
    ]),
    "analyzeEmail",
    () => ({
      category: "other" as const,
      priority: "low" as const,
      needsReply: false,
      summary: fallbackSummary,
    })
  );
}
