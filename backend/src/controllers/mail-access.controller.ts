import type { Response } from "express";
import { z, ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { GmailAccountModel } from "../models/gmail-account.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { UserModel } from "../models/user.model";
import { getGoogleAuthUrl } from "../services/google-oauth.service";
import { sendSystemEmail } from "../services/system-email.service";
import { recordAuditEvent } from "../services/audit.service";
import { createNotification } from "../services/notification.service";
import { buildAppUrl, buildBrandedEmail } from "../services/email-template.service";
import { signState } from "../utils/auth";

const requiredGmailScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function hasRequiredGmailScopes(scopeValue?: string | null) {
  const scopes = new Set(
    String(scopeValue ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return requiredGmailScopes.every((scope) => scopes.has(scope));
}

const requestStartSchema = z.object({
  requestedAccountEmail: z.string().trim().email(),
});

function requireAdmin(user: { role?: string | null }) {
  return user.role === "admin";
}

function buildApprovalEmail(name: string, requestedAccountEmail: string) {
  const plainText = [
    `Hi ${name},`,
    "",
    `Your MailPilot testing request for ${requestedAccountEmail} has been approved.`,
    "This mailbox is now approved in SK MailPilot.",
    "",
    "Return to MailPilot, connect the approved mailbox, then run Sync inbox.",
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `${requestedAccountEmail} is approved and ready to connect in MailPilot.`,
    eyebrow: "Mailbox approved",
    title: "Your mailbox access is ready",
    greeting: `Hi ${name},`,
    intro: `Your MailPilot testing request for ${requestedAccountEmail} has been approved.`,
    body: [
      "This mailbox is now approved in SK MailPilot.",
      "Return to MailPilot, connect the approved mailbox, then run Sync inbox to bring messages into your workspace.",
    ],
    details: [
      { label: "Mailbox", value: requestedAccountEmail },
      { label: "Status", value: "Approved" },
    ],
    action: {
      label: "Open MailPilot",
      url: buildAppUrl("/emails"),
    },
    footerNote: "Access is limited to the approved mailbox shown above.",
  });

  return { plainText, html };
}

function buildPendingApprovalEmail(requesterName: string, requesterEmail: string, requestedAccountEmail: string, requestId: string) {
  const plainText = [
    "A MailPilot mailbox request is ready for admin approval.",
    "",
    `Requester: ${requesterName}`,
    `Login email: ${requesterEmail}`,
    `Requested mailbox: ${requestedAccountEmail}`,
    `Request id: ${requestId}`,
    "",
    "Review this request in MailPilot:",
    buildAppUrl("/"),
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `${requestedAccountEmail} is waiting for admin approval.`,
    eyebrow: "Admin review",
    title: "New mailbox approval request",
    greeting: "Hi Admin,",
    intro: "A MailPilot mailbox request is ready for review.",
    details: [
      { label: "Requester", value: requesterName },
      { label: "Login email", value: requesterEmail },
      { label: "Requested mailbox", value: requestedAccountEmail },
      { label: "Request ID", value: requestId },
    ],
    action: {
      label: "Review request",
      url: buildAppUrl("/"),
    },
    footerNote: "Approve only if this user should be allowed to connect and manage the requested mailbox in SK MailPilot.",
  });

  return { plainText, html };
}

async function sendPendingRequestAlerts(options: {
  requesterName: string;
  requesterEmail: string;
  requestedAccountEmail: string;
  requestId: string;
}) {
  const pendingApprovalEmail = buildPendingApprovalEmail(
    options.requesterName,
    options.requesterEmail,
    options.requestedAccountEmail,
    options.requestId
  );

  const adminUsers = await UserModel.find({ role: "admin" }).select({ email: 1 }).lean();
  const recipients = adminUsers.map((adminUser) => adminUser.email).filter(Boolean);
  if (recipients.length) {
    await sendSystemEmail({
      to: recipients,
      subject: `Mail access request pending approval: ${options.requestedAccountEmail}`,
      body: pendingApprovalEmail.plainText,
      htmlBody: pendingApprovalEmail.html,
    });
  }
}

async function getCurrentUser(req: AuthenticatedRequest) {
  if (!req.auth?.userId) {
    return null;
  }

  return UserModel.findById(req.auth.userId);
}

export async function startMailAccessRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const payload = requestStartSchema.parse(req.body ?? {});
    const requestedAccountEmail = payload.requestedAccountEmail.trim().toLowerCase();
    const existingActiveAccount = await GmailAccountModel.findOne({
      userId: user._id,
      email: requestedAccountEmail,
      status: "active",
    })
      .select({ _id: 1, scope: 1 })
      .lean();

    if (existingActiveAccount && hasRequiredGmailScopes(existingActiveAccount.scope)) {
      res.status(200).json({
        success: true,
        data: {
          requestedAccountEmail,
          alreadyApproved: true,
          requestStatus: "approved",
          authUrl: null,
        },
      });
      return;
    }

    const existingApprovedRequest = await MailAccessRequestModel.findOne({
      requesterEmail: user.email,
      requestedAccountEmail,
      status: "approved",
    })
      .select({ _id: 1 })
      .lean();

    if (existingApprovedRequest) {
      res.status(200).json({
        success: true,
        data: {
          requestedAccountEmail,
          alreadyApproved: true,
          requestStatus: "approved",
          authUrl: null,
        },
      });
      return;
    }

    if (requestedAccountEmail === user.email.trim().toLowerCase()) {
      const requestDoc = await MailAccessRequestModel.findOneAndUpdate(
        {
          requesterEmail: user.email,
          requestedAccountEmail,
          status: "pending",
        },
        {
          $set: {
            userId: user._id,
            requesterName: user.name,
            requesterEmail: user.email,
            loginEmail: user.email,
            requestedAccountEmail,
            requestedEmailVerifiedAt: new Date(),
            status: "pending",
          },
          $unset: {
            requestedEmailOtpHash: 1,
            requestedEmailOtpExpiresAt: 1,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        }
      );

      try {
        await sendPendingRequestAlerts({
          requesterName: user.name,
          requesterEmail: user.email,
          requestedAccountEmail,
          requestId: String(requestDoc._id),
        });

        requestDoc.notificationSentAt = new Date();
        await requestDoc.save();
      } catch {
        // Keep the request pending even if the admin notification fails.
      }

      await createNotification({
        userId: String(user._id),
        type: "info",
        title: "Mailbox sent for approval",
        message: `${requestedAccountEmail} is waiting for admin approval.`,
        metadata: {
          kind: "mail-access-pending",
          requestedAccountEmail,
          requestId: String(requestDoc._id),
        },
      });
      await recordAuditEvent({
        userId: String(user._id),
        actorUserId: req.auth?.userId ?? String(user._id),
        kind: "mail-access-requested",
        title: `Mailbox approval requested for ${requestedAccountEmail}`,
        status: "info",
        targetType: "mailbox-request",
        targetId: String(requestDoc._id),
        details: {
          requestedAccountEmail,
          status: "pending",
          verifiedByLoginEmail: true,
        },
      });

      const adminUsers = await UserModel.find({ role: "admin" }).select({ _id: 1 }).lean();
      await Promise.all(adminUsers.map((adminUser) => createNotification({
        userId: String(adminUser._id),
        type: "warning",
        title: "New mailbox approval request",
        message: `${requestedAccountEmail} is waiting for approval.`,
        metadata: {
          kind: "mail-access-admin-review",
          requestedAccountEmail,
          requestId: String(requestDoc._id),
          requesterEmail: user.email,
        },
      })));

      res.status(200).json({
        success: true,
        data: {
          requestedAccountEmail,
          alreadyApproved: false,
          requestStatus: "pending",
          authUrl: null,
        },
      });
      return;
    }

    const state = signState({
      kind: "request-mail-access",
      userId: String(user._id),
      requestedAccountEmail,
      returnTo: "/emails",
    });
    const authUrl = getGoogleAuthUrl({
      redirectPath: "/api/accounts/google/callback",
      scope: ["openid", "email", "profile"],
      state,
      loginHint: requestedAccountEmail,
    });

    res.status(200).json({
      success: true,
      data: {
        requestedAccountEmail,
        alreadyApproved: false,
        requestStatus: "verification_required",
        authUrl,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid mail access request",
        details: error.flatten(),
      });
      return;
    }

    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start Google mailbox verification",
    });
  }
}

export async function verifyMailAccessRequest(req: AuthenticatedRequest, res: Response) {
  res.status(410).json({
    success: false,
    error: "OTP verification has been removed. Verify this mailbox through Google sign-in instead.",
  });
}

export async function listMailAccessRequests(req: AuthenticatedRequest, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  if (!requireAdmin(user)) {
    res.status(403).json({
      success: false,
      error: "Admin access required",
    });
    return;
  }

  const requests = await MailAccessRequestModel.find({})
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: requests.map((request) => ({
      id: String(request._id),
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail,
      loginEmail: request.loginEmail,
      requestedAccountEmail: request.requestedAccountEmail,
      status: request.status,
      notificationSentAt: request.notificationSentAt,
      requestedEmailVerifiedAt: request.requestedEmailVerifiedAt,
      approvedAt: request.approvedAt,
      approvedByEmail: request.approvedByEmail ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    })),
  });
}

export async function listMyMailAccessRequests(req: AuthenticatedRequest, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  const requests = await MailAccessRequestModel.find({
    requesterEmail: user.email,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: requests.map((request) => ({
      id: String(request._id),
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail,
      loginEmail: request.loginEmail,
      requestedAccountEmail: request.requestedAccountEmail,
      status: request.status,
      notificationSentAt: request.notificationSentAt,
      requestedEmailVerifiedAt: request.requestedEmailVerifiedAt,
      approvedAt: request.approvedAt,
      approvedByEmail: request.approvedByEmail ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    })),
  });
}

export async function approveMailAccessRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    if (!requireAdmin(user)) {
      res.status(403).json({
        success: false,
        error: "Admin access required",
      });
      return;
    }

    const requestId = z.string().min(1).parse(req.params.id);
    const requestDoc = await MailAccessRequestModel.findById(requestId);

    if (!requestDoc) {
      res.status(404).json({
        success: false,
        error: "Mail access request not found",
      });
      return;
    }

    if (requestDoc.status !== "pending") {
      res.status(409).json({
        success: false,
        error: "Only pending requests can be approved",
      });
      return;
    }

    const { plainText, html } = buildApprovalEmail(
      requestDoc.requesterName,
      requestDoc.requestedAccountEmail
    );
    const recipients = Array.from(
      new Set(
        [requestDoc.loginEmail, requestDoc.requestedAccountEmail].map((value) =>
          value.trim().toLowerCase()
        )
      )
    );

    await sendSystemEmail({
      to: recipients,
      subject: `MailPilot access approved for ${requestDoc.requestedAccountEmail}`,
      body: plainText,
      htmlBody: html,
    });

    requestDoc.status = "approved";
    requestDoc.approvedAt = new Date();
    requestDoc.approvedByEmail = user.email;
    await requestDoc.save();

    await createNotification({
      userId: String(requestDoc.userId),
      type: "success",
      title: "Mailbox approved",
      message: `${requestDoc.requestedAccountEmail} is approved and ready to connect in MailPilot.`,
      metadata: {
        kind: "mail-access-approved",
        requestedAccountEmail: requestDoc.requestedAccountEmail,
        requestId: String(requestDoc._id),
      },
    });
    await recordAuditEvent({
      userId: String(requestDoc.userId),
      actorUserId: req.auth?.userId ?? String(user._id),
      kind: "mail-access-approved",
      title: `Mailbox approved: ${requestDoc.requestedAccountEmail}`,
      status: "success",
      targetType: "mailbox-request",
      targetId: String(requestDoc._id),
      details: {
        requestedAccountEmail: requestDoc.requestedAccountEmail,
        approvedByEmail: user.email,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        id: String(requestDoc._id),
        status: requestDoc.status,
        approvedAt: requestDoc.approvedAt,
        approvedByEmail: requestDoc.approvedByEmail,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid approval request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve mail access request",
    });
  }
}

export async function rejectMailAccessRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (!requireAdmin(user)) {
      res.status(403).json({ success: false, error: "Admin access required" });
      return;
    }

    const requestId = z.string().min(1).parse(req.params.id);
    const requestDoc = await MailAccessRequestModel.findById(requestId);
    if (!requestDoc) {
      res.status(404).json({ success: false, error: "Mail access request not found" });
      return;
    }

    await GmailAccountModel.findOneAndUpdate(
      {
        userId: requestDoc.userId,
        email: requestDoc.requestedAccountEmail,
      },
      {
        $set: {
          status: "disconnected",
        },
      }
    );

    await MailAccessRequestModel.findByIdAndDelete(requestDoc._id);

    await createNotification({
      userId: String(requestDoc.userId),
      type: "warning",
      title: "Mailbox request declined",
      message: `${requestDoc.requestedAccountEmail} was not approved for MailPilot access.`,
      metadata: {
        kind: "mail-access-rejected",
        requestedAccountEmail: requestDoc.requestedAccountEmail,
        requestId: String(requestDoc._id),
      },
    });
    await recordAuditEvent({
      userId: String(requestDoc.userId),
      actorUserId: req.auth?.userId ?? String(user._id),
      kind: "mail-access-rejected",
      title: `Mailbox rejected: ${requestDoc.requestedAccountEmail}`,
      status: "warning",
      targetType: "mailbox-request",
      targetId: String(requestDoc._id),
      details: {
        requestedAccountEmail: requestDoc.requestedAccountEmail,
        rejectedByEmail: user.email,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        id: String(requestDoc._id),
        status: "rejected",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: "Invalid reject request", details: error.flatten() });
      return;
    }
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to reject mail access request",
    });
  }
}
