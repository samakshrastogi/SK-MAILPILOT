import { getRequiredEnv } from "../config/env";

type SystemEmailOptions = {
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string | null;
  cc?: string[] | null;
  bcc?: string[] | null;
};

type ResendErrorResponse = {
  message?: string;
  name?: string;
  error?: string;
};

function getSenderAddress() {
  const fromEmail = getRequiredEnv("MAIL_FROM");
  const fromName = process.env.MAIL_FROM_NAME?.trim();

  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function normalizeRecipients(value: string | string[] | null | undefined) {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean);
}

export async function sendSystemEmail(options: SystemEmailOptions) {
  const cc = normalizeRecipients(options.cc);
  const bcc = normalizeRecipients(options.bcc);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getSenderAddress(),
      to: normalizeRecipients(options.to),
      subject: options.subject,
      text: options.body,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(options.htmlBody?.trim() ? { html: options.htmlBody } : {}),
    }),
  });

  if (!response.ok) {
    let errorPayload: ResendErrorResponse | null = null;

    try {
      errorPayload = (await response.json()) as ResendErrorResponse;
    } catch {
      errorPayload = null;
    }

    const message =
      errorPayload?.message ??
      errorPayload?.error ??
      `Resend request failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.json();
}
