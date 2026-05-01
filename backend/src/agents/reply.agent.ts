import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { EmailAutomationState } from "../graph/email.graph";
import {
  llm,
  llmLimits,
  prepareEmailBodyForLlm,
  shouldSkipLlm,
  withLlmTimeout,
} from "../services/llm.service";

export const emailReplySchema = z.object({
  reply: z.string().min(1),
});

export const replyStyleSchema = z.enum([
  "professional",
  "friendly",
  "short",
  "detailed",
]);

export type ReplyStyle = z.infer<typeof replyStyleSchema>;

const replyModel = llm.withStructuredOutput(emailReplySchema, {
  name: "email_reply",
});

type ReplyGenerationState = Pick<
  EmailAutomationState,
  "subject" | "from" | "body" | "category" | "priority" | "summary"
>;

function splitIntoSentences(value: string) {
  return value
    .replace(/\r/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function getPrimaryRequest(state: ReplyGenerationState) {
  const questionSentence = splitIntoSentences(state.body).find((sentence) =>
    sentence.includes("?")
  );

  if (questionSentence) {
    return questionSentence.replace(/\s+/g, " ").trim();
  }

  const requestSentence = splitIntoSentences(state.body).find((sentence) =>
    /\b(please|can you|could you|would you|kindly|need|request|share|send|confirm|review|reply|help)\b/i.test(
      sentence
    )
  );

  if (requestSentence) {
    return requestSentence.replace(/\s+/g, " ").trim();
  }

  if (state.summary?.trim()) {
    return state.summary.trim();
  }

  return state.subject.trim() || "your message";
}

function buildResponseByStyle(lines: string[], style: ReplyStyle) {
  const filtered = lines.map((line) => line.trim()).filter(Boolean);

  if (style === "short") {
    return filtered.slice(0, 2).join(" ");
  }

  if (style === "detailed") {
    return filtered.join("\n\n");
  }

  return filtered.join(" ");
}

export function buildContextAwareFallbackReply(
  state: ReplyGenerationState,
  style: ReplyStyle = "professional"
) {
  const request = getPrimaryRequest(state);
  const senderName = state.from.split("<")[0]?.trim() || "there";
  const lowerContext = `${state.subject} ${state.summary ?? ""} ${state.body}`.toLowerCase();
  const greeting =
    style === "friendly" ? `Hi ${senderName},` : style === "short" ? "" : `Hello ${senderName},`;

  const lines: string[] = [];
  if (greeting) {
    lines.push(greeting);
  }

  if (/\b(interview|job|application|resume|cv)\b/i.test(lowerContext)) {
    lines.push(
      "Thank you for reaching out. I reviewed your message and I am interested in continuing the conversation."
    );
    lines.push(
      `Regarding ${request.replace(/[?]+$/, "")}, please share the next steps or available time slots and I will respond promptly.`
    );
  } else if (/\b(invoice|payment|amount|due|receipt|finance|quote)\b/i.test(lowerContext)) {
    lines.push(
      `Thank you for the details regarding ${request.replace(/[?]+$/, "")}.`
    );
    lines.push(
      "I have noted the financial information and will review it carefully before confirming any next action."
    );
  } else if (/\b(meeting|schedule|call|availability|tomorrow|today|next week)\b/i.test(lowerContext)) {
    lines.push(
      `Thanks for your message about ${request.replace(/[?]+$/, "")}.`
    );
    lines.push(
      "I am available to coordinate the timing. Please share the preferred slot if you want me to confirm a meeting."
    );
  } else if (/\b(support|issue|problem|bug|error|help)\b/i.test(lowerContext)) {
    lines.push(
      `I reviewed your message about ${request.replace(/[?]+$/, "")}.`
    );
    lines.push(
      "I understand the issue and I am looking into it. If there are any additional details or screenshots, please send them so I can help faster."
    );
  } else {
    lines.push(
      `Thank you for your email about ${request.replace(/[?]+$/, "")}.`
    );
    lines.push(
      "I reviewed your message and will follow up on the points you raised. If you want me to prioritize a specific item, please let me know."
    );
  }

  if (style === "friendly") {
    lines.push("Thanks again.");
  } else if (style === "professional") {
    lines.push("Best regards,");
  }

  return buildResponseByStyle(lines, style);
}

export async function generateReply(
  state: ReplyGenerationState,
  style: ReplyStyle = "professional"
) {
  if (shouldSkipLlm(state.body)) {
    return {
      reply: buildContextAwareFallbackReply(state, style),
    };
  }

  const preparedBody = prepareEmailBodyForLlm(state.body);

  return withLlmTimeout(
      replyModel.invoke([
        new SystemMessage(
          [
            "You generate context-aware email replies.",
            "Return a short structured JSON result only.",
            "Do not invent facts, timelines, prices, links, or attachments.",
            "If details are missing, acknowledge the message and respond conservatively.",
            "Match the requested tone exactly.",
            style === "professional"
              ? "Use a professional, crisp, businesslike tone and keep the reply under 90 words."
              : style === "friendly"
                ? "Use a warm, natural, personable tone and keep the reply under 90 words."
                : style === "short"
                  ? "Use a very short direct tone and keep the reply under 45 words."
                  : "Use a more complete and helpful tone and keep the reply under 140 words.",
            "Answer the sender's actual request, question, or concern from the email body.",
            "If the sender asks multiple things, address the main actionable point first.",
            "Avoid generic filler and avoid saying only that you will get back later unless the email truly lacks enough detail.",
            "If the email is mostly informational, keep the reply minimal.",
            "Return only the final reply body through the schema.",
          ].join(" ")
        ),
      new HumanMessage(
        [
          `From: ${state.from}`,
          `Subject: ${state.subject}`,
          `Category: ${state.category ?? "other"}`,
          `Priority: ${state.priority ?? "medium"}`,
          `Requested tone: ${style}`,
          `Summary: ${state.summary ?? ""}`,
          "Original email:",
          preparedBody,
        ].join("\n")
      ),
    ]),
    "generateReply",
    () => ({
      reply: buildContextAwareFallbackReply(state, style),
    })
  );
}
