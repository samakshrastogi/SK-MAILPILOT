import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { llm, llmEnabled, prepareEmailBodyForLlm, withLlmTimeout } from "./llm.service";

export type EmailAttachmentRecord = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  previewUrl: string | null;
  extractedText: string | null;
  documentType: "invoice" | "resume" | "form" | "pdf" | "text" | "image" | "other";
  summary: string | null;
  keyData: string[];
  importantSections: string[];
  extractedFields: Array<{
    label: string;
    value: string;
  }>;
};

const attachmentInsightSchema = z.object({
  documentType: z.enum(["invoice", "resume", "form", "pdf", "text", "image", "other"]).default("other"),
  summary: z.string().min(1),
  keyData: z.array(z.string()).max(5).default([]),
  importantSections: z.array(z.string()).max(4).default([]),
  extractedFields: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
      })
    )
    .max(6)
    .default([]),
});

const attachmentInsightModel = llm.withStructuredOutput(attachmentInsightSchema, {
  name: "attachment_insight",
});

function stripBinaryNoise(value: string) {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPdfText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const textMatches = Array.from(raw.matchAll(/\(([^()]*)\)/g))
    .map((match) => stripBinaryNoise(match[1] ?? ""))
    .filter((value) => value.length > 2);

  if (textMatches.length > 0) {
    return textMatches.join(" ").slice(0, 4000);
  }

  return stripBinaryNoise(raw).slice(0, 4000);
}

export function buildPreviewUrl(mimeType: string, buffer: Buffer, maxBytes: number) {
  if (buffer.byteLength > maxBytes) {
    return null;
  }

  const safeMimeType =
    mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/")
      ? mimeType
      : "application/octet-stream";

  return `data:${safeMimeType};base64,${buffer.toString("base64")}`;
}

function extractInvoiceLikeData(text: string) {
  const items: string[] = [];
  const amountMatch = text.match(/\b(?:USD|INR|\$|€|£)\s?\d[\d,]*(?:\.\d{2})?/i);
  const dateMatch = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}\b/i);
  const invoiceMatch = text.match(/\b(?:invoice|receipt|order)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([a-z0-9-]+)/i);

  if (amountMatch) {
    items.push(`Amount: ${amountMatch[0]}`);
  }
  if (dateMatch) {
    items.push(`Date: ${dateMatch[0]}`);
  }
  if (invoiceMatch?.[1]) {
    items.push(`Reference: ${invoiceMatch[1]}`);
  }

  return items;
}

function detectDocumentType(filename: string, mimeType: string, text: string) {
  const normalized = `${filename} ${mimeType} ${text}`.toLowerCase();
  if (/invoice|receipt|purchase order|gst|bill to|amount due/.test(normalized)) {
    return "invoice" as const;
  }
  if (/resume|curriculum vitae|experience|education|skills/.test(normalized)) {
    return "resume" as const;
  }
  if (/form|application|checkbox|signature|submitted|response/.test(normalized)) {
    return "form" as const;
  }
  if (mimeType === "application/pdf") {
    return "pdf" as const;
  }
  if (mimeType.startsWith("text/")) {
    return "text" as const;
  }
  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }
  return "other" as const;
}

function extractStructuredFields(text: string, documentType: EmailAttachmentRecord["documentType"]) {
  const fields: Array<{ label: string; value: string }> = [];
  const pushIfValue = (label: string, value?: string | null) => {
    const normalized = value?.trim();
    if (normalized) {
      fields.push({ label, value: normalized });
    }
  };

  if (documentType === "invoice") {
    pushIfValue("Invoice number", text.match(/\b(?:invoice|receipt|order)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([a-z0-9-]+)/i)?.[1] ?? null);
    pushIfValue("Amount", text.match(/\b(?:USD|INR|\$|€|£)\s?\d[\d,]*(?:\.\d{2})?/i)?.[0] ?? null);
    pushIfValue("Date", text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}\b/i)?.[0] ?? null);
  }

  if (documentType === "resume") {
    pushIfValue("Email", text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null);
    pushIfValue("Phone", text.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0] ?? null);
    pushIfValue("Experience", text.match(/\b\d+\+?\s+years? of experience\b/i)?.[0] ?? null);
  }

  if (documentType === "form") {
    pushIfValue("Submitted by", text.match(/\bname\s*[:\-]\s*([^\n]+)/i)?.[1] ?? null);
    pushIfValue("Email", text.match(/\bemail\s*[:\-]\s*([^\n]+)/i)?.[1] ?? null);
    pushIfValue("Reference", text.match(/\b(reference|application id|ticket id)\s*[:\-]\s*([^\n]+)/i)?.[2] ?? null);
  }

  return fields.slice(0, 6);
}

export async function analyzeAttachmentText(input: {
  filename: string;
  mimeType: string;
  text: string;
}): Promise<Pick<EmailAttachmentRecord, "documentType" | "summary" | "keyData" | "importantSections" | "extractedFields">> {
  const normalizedText = prepareEmailBodyForLlm(input.text).slice(0, 1200);
  const fallbackKeyData = extractInvoiceLikeData(input.text);
  const fallbackSections = input.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12)
    .slice(0, 3);
  const fallbackDocumentType = detectDocumentType(input.filename, input.mimeType, input.text);
  const fallbackFields = extractStructuredFields(input.text, fallbackDocumentType);

  if (!normalizedText) {
    return {
      documentType: fallbackDocumentType,
      summary: null,
      keyData: fallbackKeyData,
      importantSections: fallbackSections,
      extractedFields: fallbackFields,
    };
  }

  if (!llmEnabled) {
    return {
      documentType: fallbackDocumentType,
      summary: `Attachment extracted from ${input.filename}`,
      keyData: fallbackKeyData,
      importantSections: fallbackSections,
      extractedFields: fallbackFields,
    };
  }

  const result = await withLlmTimeout(
    attachmentInsightModel.invoke([
      new SystemMessage(
        [
          "You analyze email attachments.",
          "Classify whether the file is an invoice, resume, form, pdf, text, image, or other.",
          "Summarize the attachment briefly.",
          "Extract important facts like money, dates, names, references, or actions.",
          "Extract up to six concise label/value fields when possible.",
          "Highlight the most important sections in short phrases.",
          "Return structured JSON only.",
        ].join(" ")
      ),
      new HumanMessage(
        [
          `Filename: ${input.filename}`,
          `Mime type: ${input.mimeType}`,
          "Attachment text:",
          normalizedText,
        ].join("\n")
      ),
    ]),
    "attachment.analyze",
    () => ({
      documentType: fallbackDocumentType,
      summary: `Attachment extracted from ${input.filename}`,
      keyData: fallbackKeyData,
      importantSections: fallbackSections,
      extractedFields: fallbackFields,
    })
  );

  return {
    documentType: result.documentType ?? fallbackDocumentType,
    summary: result.summary,
    keyData: result.keyData ?? [],
    importantSections: result.importantSections ?? [],
    extractedFields: result.extractedFields?.length ? result.extractedFields : fallbackFields,
  };
}
