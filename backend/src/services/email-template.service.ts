type EmailAction = {
  label: string;
  url: string;
};

type EmailDetail = {
  label: string;
  value: string;
};

type BrandedEmailOptions = {
  preheader?: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  intro: string;
  body?: string[];
  code?: string;
  details?: EmailDetail[];
  action?: EmailAction;
  footerNote?: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildAppUrl(path = "/") {
  const baseUrl = (process.env.WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}/#${normalizedPath}`;
}

export function buildBrandedEmail(options: BrandedEmailOptions) {
  const preheader = options.preheader ?? options.title;
  const bodyRows = [
    options.greeting
      ? `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#334155;">${escapeEmailHtml(options.greeting)}</p>`
      : "",
    `<p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">${escapeEmailHtml(options.intro)}</p>`,
    ...(options.body ?? []).map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#475569;">${escapeEmailHtml(paragraph)}</p>`
    ),
    options.code
      ? `<div style="margin:22px 0 18px;text-align:center;">
          <div style="display:inline-block;border-radius:14px;background:#0f172a;color:#ffffff;padding:16px 22px;font-size:28px;line-height:32px;font-weight:700;letter-spacing:8px;font-family:Arial,Helvetica,sans-serif;">
            ${escapeEmailHtml(options.code)}
          </div>
        </div>`
      : "",
    options.details?.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          ${options.details
            .map(
              (detail) => `<tr>
                <td style="width:36%;padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${escapeEmailHtml(detail.label)}</td>
                <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;word-break:break-word;">${escapeEmailHtml(detail.value)}</td>
              </tr>`
            )
            .join("")}
        </table>`
      : "",
    options.action
      ? `<div style="margin:24px 0 8px;">
          <a href="${escapeEmailHtml(options.action.url)}" style="display:inline-block;border-radius:12px;background:#0f172a;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">
            ${escapeEmailHtml(options.action.label)}
          </a>
        </div>`
      : "",
    options.footerNote
      ? `<p style="margin:18px 0 0;font-size:12px;line-height:20px;color:#64748b;">${escapeEmailHtml(options.footerNote)}</p>`
      : "",
  ].join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeEmailHtml(options.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeEmailHtml(preheader)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                  <tr>
                    <td style="font-size:18px;font-weight:800;color:#0f172a;">SK MailPilot</td>
                    <td align="right" style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0284c7;">Mail Operations</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #dbeafe;border-radius:22px;background:#ffffff;box-shadow:0 20px 45px rgba(15,23,42,0.08);overflow:hidden;">
                <div style="height:6px;background:linear-gradient(90deg,#0284c7,#4f46e5,#0f172a);"></div>
                <div style="padding:30px 30px 26px;">
                  ${options.eyebrow ? `<p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#0284c7;">${escapeEmailHtml(options.eyebrow)}</p>` : ""}
                  <h1 style="margin:0 0 18px;font-size:24px;line-height:31px;color:#0f172a;font-weight:800;">${escapeEmailHtml(options.title)}</h1>
                  ${bodyRows}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;text-align:center;font-size:12px;line-height:19px;color:#64748b;">
                This message was sent by SK MailPilot. If you did not request this, you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
