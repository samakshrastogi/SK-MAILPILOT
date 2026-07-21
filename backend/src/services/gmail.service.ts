import { google, gmail_v1 } from "googleapis";
import { z } from "zod";
import {
  analyzeAttachmentText,
  buildPreviewUrl,
  extractPdfText,
  type EmailAttachmentRecord,
} from "./attachment-analysis.service";
import { GmailAccountModel } from "../models/gmail-account.model";
import { logger } from "../utils/logger";
import { getRequiredEnv, getRequiredNumberEnv } from "../config/env";

const gmailFetchOptionsSchema = z.object({
  maxResults: z.number().int().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  labelIds: z.array(z.string().trim().min(1)).default(["INBOX"]),
  pageToken: z.string().trim().min(1).optional(),
});

export type GmailFetchOptions = z.infer<typeof gmailFetchOptionsSchema>;

export type GmailEmail = {
  accountId: string | null;
  gmailMessageId: string;
  gmailThreadId: string;
  labelIds: string[];
  subject: string;
  from: string;
  sender: string;
  recipients: string[];
  body: string;
  htmlBody: string | null;
  attachments: EmailAttachmentRecord[];
  snippet: string;
  originalDate: Date | null;
};

export type GmailSendAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

type GmailAccountContext = {
  id: string | null;
  email?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  scope?: string | null;
};

const gmailApiTimeoutMs = getRequiredNumberEnv("GMAIL_API_TIMEOUT_MS");
const configuredGmailFetchMaxResults = getRequiredNumberEnv("GMAIL_FETCH_MAX_RESULTS");
const gmailFetchMaxResults =
  Number.isFinite(configuredGmailFetchMaxResults) && configuredGmailFetchMaxResults > 0
    ? Math.min(100, Math.floor(configuredGmailFetchMaxResults))
    : 100;
const gmailMessageFetchConcurrency = Math.max(
  1,
  getRequiredNumberEnv("GMAIL_MESSAGE_FETCH_CONCURRENCY")
);
const attachmentPreviewMaxBytes = getRequiredNumberEnv("ATTACHMENT_PREVIEW_MAX_BYTES");
const requiredSendScopes = getRequiredEnv("GOOGLE_REQUIRED_SEND_SCOPES");
const requiredReadScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

function normalizeScopeList(scopeValue?: string | null) {
  return new Set(
    String(scopeValue ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function hasAnyScope(scopeValue: string | null | undefined, requiredScopes: string[]) {
  const scopes = normalizeScopeList(scopeValue);
  return requiredScopes.some((scope) => scopes.has(scope));
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${gmailApiTimeoutMs}ms`));
        }, gmailApiTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

function toReadableGmailError(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : "Unknown Gmail API error";

  if (/invalid_grant/i.test(message)) {
    return new Error(
      `Gmail ${action} failed because GOOGLE_REFRESH_TOKEN is invalid or expired. Generate a new refresh token for this OAuth client and update backend/.env. If the Google OAuth consent screen is still in Testing, Google can expire refresh tokens after 7 days.`
    );
  }

  if (/insufficient authentication scopes/i.test(message)) {
    return new Error(
      `Gmail ${action} failed because GOOGLE_REFRESH_TOKEN does not include a send-capable scope. Recreate the refresh token with ${requiredSendScopes}.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

async function resolveAccountContext(accountId?: string | null): Promise<GmailAccountContext> {
  if (!accountId) {
    return {
      id: null,
      accessToken: null,
      refreshToken: getRequiredEnv("GOOGLE_REFRESH_TOKEN"),
      scope: getRequiredEnv("GOOGLE_REQUIRED_SEND_SCOPES"),
    };
  }

  const account = await GmailAccountModel.findById(accountId).lean();
  if (!account || account.status !== "active") {
    throw new Error("Connected Gmail account not found");
  }

  if (!account.refreshToken) {
    throw new Error("Connected Gmail account is missing a refresh token");
  }

  return {
    id: String(account._id),
    email: account.email,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    scope: account.scope ?? null,
  };
}

function createOAuthClient(refreshToken: string, accessToken?: string | null) {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getRequiredEnv("GOOGLE_REDIRECT_URI");

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  client.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken,
  });

  return client;
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8"
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | null | undefined,
  name: string
) {
  const header = headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase()
  );

  return header?.value?.trim() ?? "";
}

function extractPlainTextBody(payload?: gmail_v1.Schema$MessagePart | null): string {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).trim();
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])>/gi, "\n")
      .replace(/<li/gi, "\n<li")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
  }

  for (const part of payload.parts ?? []) {
    const content = extractPlainTextBody(part);
    if (content) {
      return content;
    }
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data).trim();
  }

  return "";
}

function collectAttachmentParts(
  payload?: gmail_v1.Schema$MessagePart | null,
  bucket: gmail_v1.Schema$MessagePart[] = []
) {
  if (!payload) {
    return bucket;
  }

  if (payload.filename && payload.filename.trim()) {
    bucket.push(payload);
  }

  for (const part of payload.parts ?? []) {
    collectAttachmentParts(part, bucket);
  }

  return bucket;
}

function sanitizeHtmlForDisplay(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\{[^}]*\}/gi, "");
}

function wrapHtmlForDisplay(html: string) {
  const safeHtml = sanitizeHtmlForDisplay(html);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 18px;
        color: #1f2937;
        background: #ffffff;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.5;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      blockquote {
        margin-left: 0;
        padding-left: 12px;
        border-left: 3px solid #d1d5db;
        color: #4b5563;
      }
    </style>
  </head>
  <body>${safeHtml}</body>
</html>`;
}

function extractHtmlBody(payload?: gmail_v1.Schema$MessagePart | null): string | null {
  if (!payload) {
    return null;
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return wrapHtmlForDisplay(decodeBase64Url(payload.body.data).trim());
  }

  for (const part of payload.parts ?? []) {
    const content = extractHtmlBody(part);
    if (content) {
      return content;
    }
  }

  return null;
}

function buildPlainTextHtml(body: string) {
  return wrapHtmlForDisplay(
    `<pre style="white-space: pre-wrap; font-family: Arial, Helvetica, sans-serif;">${escapeHtml(
      body
    )}</pre>`
  );
}

async function getAttachmentBuffer(
  gmail: gmail_v1.Gmail,
  messageId: string,
  part: gmail_v1.Schema$MessagePart
) {
  if (part.body?.data) {
    return Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  if (!part.body?.attachmentId) {
    return null;
  }

  const response = await withTimeout(
    gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: part.body.attachmentId,
    }),
    `gmail.users.messages.attachments.get:${part.body.attachmentId}`
  );

  if (!response.data.data) {
    return null;
  }

  return Buffer.from(response.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function analyzeAttachmentPart(
  gmail: gmail_v1.Gmail,
  messageId: string,
  part: gmail_v1.Schema$MessagePart
): Promise<EmailAttachmentRecord> {
  const filename = part.filename?.trim() || "attachment";
  const mimeType = part.mimeType || "application/octet-stream";
  const size = part.body?.size ?? 0;
  const attachmentId = part.body?.attachmentId ?? null;
  const buffer = await getAttachmentBuffer(gmail, messageId, part);
  const previewUrl = buffer ? buildPreviewUrl(mimeType, buffer, attachmentPreviewMaxBytes) : null;
  let extractedText: string | null = null;

  if (buffer) {
    if (mimeType === "application/pdf") {
      extractedText = extractPdfText(buffer);
    } else if (mimeType.startsWith("text/")) {
      extractedText = buffer.toString("utf8").slice(0, 4000);
    }
  }

  const analysis =
    extractedText && extractedText.trim()
      ? await analyzeAttachmentText({
          filename,
          mimeType,
          text: extractedText,
        })
      : {
          documentType: mimeType === "application/pdf" ? "pdf" : mimeType.startsWith("text/") ? "text" : "other",
          summary: null,
          keyData: [],
          importantSections: [],
          extractedFields: [],
        };

  return {
    filename,
    mimeType,
    size,
    attachmentId,
    previewUrl,
    extractedText,
    documentType: analysis.documentType as EmailAttachmentRecord["documentType"],
    summary: analysis.summary,
    keyData: analysis.keyData,
    importantSections: analysis.importantSections,
    extractedFields: analysis.extractedFields,
  };
}

async function toGmailEmail(
  gmail: gmail_v1.Gmail,
  message: gmail_v1.Schema$Message,
  accountId: string | null
): Promise<GmailEmail> {
  const headers = message.payload?.headers;
  const subject = extractHeader(headers, "subject") || "(No subject)";
  const from = extractHeader(headers, "from") || "unknown@example.com";
  const senderMatch = from.match(/<([^>]+)>/);
  const sender = (senderMatch?.[1] ?? from).trim().toLowerCase();
  const recipients = extractHeader(headers, "to").split(",").map((value) => value.trim()).filter(Boolean);
  const body = extractPlainTextBody(message.payload) || message.snippet || "";

  if (!message.id || !message.threadId) {
    throw new Error("Gmail API returned a message without id or threadId");
  }

  const attachments = await Promise.all(
    collectAttachmentParts(message.payload)
      .slice(0, 5)
      .map((part) => analyzeAttachmentPart(gmail, message.id!, part))
  );

  return {
    accountId,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    labelIds: message.labelIds ?? [],
    subject,
    from,
    sender,
    recipients,
    body,
    htmlBody: extractHtmlBody(message.payload) ?? buildPlainTextHtml(body),
    attachments,
    snippet: message.snippet ?? "",
    originalDate: message.internalDate
      ? new Date(Number(message.internalDate))
      : null,
  };
}

export async function fetchEmailsFromGmail(
  options: Partial<GmailFetchOptions> & {
    accountId?: string | null;
    onMessageFetched?: () => void;
    onPageFetched?: (count: number) => void;
    onTotalResolved?: (count: number) => void;
    onEmailResolved?: (email: GmailEmail) => void | Promise<void>;
  } = {}
): Promise<GmailEmail[]> {
  const parsedOptions = gmailFetchOptionsSchema.parse(options);
  logger.info("Starting Gmail fetch", parsedOptions);
  const account = await resolveAccountContext(options.accountId);
  if (account.id && !hasAnyScope(account.scope, requiredReadScopes)) {
    throw new Error(
      "Request had insufficient authentication scopes. Reconnect this mail and grant Gmail read permissions."
    );
  }
  const auth = createOAuthClient(account.refreshToken ?? getRequiredEnv("GOOGLE_REFRESH_TOKEN"), account.accessToken);
  const gmail = google.gmail({
    version: "v1",
    auth,
  });

  const messageRefs: gmail_v1.Schema$Message[] = [];
  let nextPageToken = parsedOptions.pageToken;
  let pageCount = 0;
  const targetCount = Math.min(parsedOptions.maxResults ?? gmailFetchMaxResults, gmailFetchMaxResults);

  do {
    const remaining = typeof targetCount === "number" ? targetCount - messageRefs.length : 100;

    if (typeof targetCount === "number" && remaining <= 0) {
      break;
    }

    const listResponse = await withTimeout(
      gmail.users.messages.list({
        userId: "me",
        maxResults:
          typeof targetCount === "number" ? Math.min(100, Math.max(1, remaining)) : 100,
        q: parsedOptions.query,
        labelIds: parsedOptions.labelIds,
        pageToken: nextPageToken,
      }),
      "gmail.users.messages.list"
    );

    const messages = listResponse.data.messages ?? [];
    pageCount += 1;
    nextPageToken = listResponse.data.nextPageToken ?? undefined;
    messageRefs.push(...messages);

    options.onPageFetched?.(messages.length);
  } while (nextPageToken && (typeof targetCount !== "number" || messageRefs.length < targetCount));

  options.onTotalResolved?.(messageRefs.length);

  const fullMessages = await mapWithConcurrencyLimit(
    messageRefs,
    gmailMessageFetchConcurrency,
    async (messageRef) => {
      try {
        const messageResponse = await withTimeout(
          gmail.users.messages.get({
            userId: "me",
            id: messageRef.id ?? "",
            format: "full",
          }),
          `gmail.users.messages.get:${messageRef.id ?? "unknown"}`
        );

        const email = await toGmailEmail(gmail, messageResponse.data, account.id);
        options.onMessageFetched?.();
        if (email.body.trim().length > 0) {
          await options.onEmailResolved?.(email);
        }
        return email;
      } catch (error) {
        logger.warn("Skipping Gmail message after fetch failure", {
          id: messageRef.id ?? "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    }
  );

  const filteredMessages = fullMessages.filter(
    (message): message is GmailEmail => Boolean(message && message.body.trim().length > 0)
  );
  logger.info("Prepared Gmail messages for processing", {
    count: filteredMessages.length,
    pagesFetched: pageCount,
    skippedCount: fullMessages.length - filteredMessages.length,
  });

  return filteredMessages;
}

export async function trashMessageFromGmail(messageId: string, accountId?: string | null) {
  try {
    const account = await resolveAccountContext(accountId);
    const auth = createOAuthClient(account.refreshToken ?? getRequiredEnv("GOOGLE_REFRESH_TOKEN"), account.accessToken);
    const gmail = google.gmail({
      version: "v1",
      auth,
    });

    await withTimeout(
      gmail.users.messages.trash({
        userId: "me",
        id: messageId,
      }),
      `gmail.users.messages.trash:${messageId}`
    );
  } catch (error) {
    logger.warn("Failed to move Gmail message to trash", {
      messageId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function modifyMessageLabels(options: {
  messageId: string;
  accountId?: string | null;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const account = await resolveAccountContext(options.accountId);
  if (account.id && !hasAnyScope(account.scope, ["https://www.googleapis.com/auth/gmail.modify"])) {
    throw new Error(
      "Request had insufficient authentication scopes. Reconnect this mail and grant Gmail modify permissions."
    );
  }
  const auth = createOAuthClient(account.refreshToken ?? getRequiredEnv("GOOGLE_REFRESH_TOKEN"), account.accessToken);
  const gmail = google.gmail({
    version: "v1",
    auth,
  });

  await withTimeout(
    gmail.users.messages.modify({
      userId: "me",
      id: options.messageId,
      requestBody: {
        addLabelIds: options.addLabelIds ?? [],
        removeLabelIds: options.removeLabelIds ?? [],
      },
    }),
    `gmail.users.messages.modify:${options.messageId}`
  );
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildReplyRawMessage(options: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}) {
  const subject = options.subject.trim().toLowerCase().startsWith("re:")
    ? options.subject.trim()
    : `Re: ${options.subject.trim()}`;
  const headers = [
    `To: ${options.to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];

  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
    headers.push(`References: ${options.inReplyTo}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n${options.body}`;
}

function buildRawMessage(options: {
  to: string;
  cc?: string[] | null;
  bcc?: string[] | null;
  subject: string;
  body: string;
  htmlBody?: string | null;
  attachments?: GmailSendAttachment[];
}) {
  if (options.attachments?.length) {
    const mixedBoundary = `mailpilot-mixed-${Date.now()}`;
    const altBoundary = `mailpilot-alt-${Date.now()}`;
    const headers = [
      `To: ${options.to}`,
      ...(options.cc?.length ? [`Cc: ${options.cc.join(", ")}`] : []),
      ...(options.bcc?.length ? [`Bcc: ${options.bcc.join(", ")}`] : []),
      `Subject: ${options.subject.trim()}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ];

    const parts = [
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      options.body,
      `--${altBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      options.htmlBody ?? options.body.replace(/\n/g, "<br/>"),
      `--${altBoundary}--`,
      "",
      ...options.attachments.flatMap((attachment) => [
        `--${mixedBoundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        attachment.dataBase64.replace(/\s+/g, ""),
        "",
      ]),
      `--${mixedBoundary}--`,
      "",
    ];

    return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  if (options.htmlBody?.trim()) {
    const boundary = `mailpilot-${Date.now()}`;
    const headers = [
      `To: ${options.to}`,
      ...(options.cc?.length ? [`Cc: ${options.cc.join(", ")}`] : []),
      ...(options.bcc?.length ? [`Bcc: ${options.bcc.join(", ")}`] : []),
      `Subject: ${options.subject.trim()}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    const parts = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      options.body,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      options.htmlBody,
      `--${boundary}--`,
      "",
    ];

    return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  return [
    `To: ${options.to}`,
    ...(options.cc?.length ? [`Cc: ${options.cc.join(", ")}`] : []),
    ...(options.bcc?.length ? [`Bcc: ${options.bcc.join(", ")}`] : []),
    `Subject: ${options.subject.trim()}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    options.body,
  ].join("\r\n");
}

export async function sendReplyThroughGmail(options: {
  to: string;
  subject: string;
  body: string;
  accountId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  attachments?: GmailSendAttachment[];
}) {
  const account = await resolveAccountContext(options.accountId);
  if (account.id && !hasAnyScope(account.scope, ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"])) {
    throw new Error(
      "Request had insufficient authentication scopes. Reconnect this mail and grant Gmail send permissions."
    );
  }
  const auth = createOAuthClient(account.refreshToken ?? getRequiredEnv("GOOGLE_REFRESH_TOKEN"), account.accessToken);
  const gmail = google.gmail({
    version: "v1",
    auth,
  });

  const raw = encodeBase64Url(
    options.attachments?.length
      ? buildRawMessage({
          to: options.to,
          subject: options.subject.toLowerCase().startsWith("re:")
            ? options.subject
            : `Re: ${options.subject}`,
          body: options.body,
          attachments: options.attachments,
        })
      : buildReplyRawMessage({
          to: options.to,
          subject: options.subject,
          body: options.body,
          inReplyTo: options.inReplyTo,
        })
  );

  try {
    const response = await withTimeout(
      gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: options.threadId ?? undefined,
        },
      }),
      "gmail.users.messages.send"
    );

    return response.data;
  } catch (error) {
    throw toReadableGmailError(error, "send");
  }
}

export async function sendEmailThroughGmail(options: {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string | null;
  accountId?: string | null;
  cc?: string[] | null;
  bcc?: string[] | null;
  attachments?: GmailSendAttachment[];
}) {
  const account = await resolveAccountContext(options.accountId);
  if (account.id && !hasAnyScope(account.scope, ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"])) {
    throw new Error(
      "Request had insufficient authentication scopes. Reconnect this mail and grant Gmail send permissions."
    );
  }
  const auth = createOAuthClient(
    account.refreshToken ?? getRequiredEnv("GOOGLE_REFRESH_TOKEN"),
    account.accessToken
  );
  const gmail = google.gmail({
    version: "v1",
    auth,
  });

  const raw = encodeBase64Url(
    buildRawMessage({
      to: options.to,
      cc: options.cc ?? [],
      bcc: options.bcc ?? [],
      subject: options.subject,
      body: options.body,
      htmlBody: options.htmlBody ?? null,
      attachments: options.attachments ?? [],
    })
  );

  try {
    const response = await withTimeout(
      gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
        },
      }),
      "gmail.users.messages.send"
    );

    return response.data;
  } catch (error) {
    throw toReadableGmailError(error, "send");
  }
}
