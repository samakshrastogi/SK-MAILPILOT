import type { Response } from "express";
import { z, ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { GmailAccountModel } from "../models/gmail-account.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { UserModel } from "../models/user.model";
import { getGoogleAuthUrl } from "../services/google-oauth.service";
import { sendEmailThroughGmail } from "../services/gmail.service";
import { recordAuditEvent } from "../services/audit.service";
import { createNotification } from "../services/notification.service";
import { buildAppUrl, buildBrandedEmail } from "../services/email-template.service";
import { signState } from "../utils/auth";

const adminEmail = (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com")
  .trim()
  .toLowerCase();

const requestStartSchema = z.object({
  requestedAccountEmail: z.string().trim().email(),
});

function requireAdmin(userEmail: string) {
  return userEmail.trim().toLowerCase() === adminEmail;
}

function buildApprovalEmail(name: string, requestedAccountEmail: string) {
  const plainText = [
    `Hi ${name},`,
    "",
    `Your MailPilot testing request for ${requestedAccountEmail} has been approved.`,
    "This mailbox is now activated in SK MailPilot.",
    "",
    "Return to MailPilot and sync your inbox directly.",
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `${requestedAccountEmail} is approved and ready to sync in MailPilot.`,
    eyebrow: "Mailbox approved",
    title: "Your mailbox access is ready",
    greeting: `Hi ${name},`,
    intro: `Your MailPilot testing request for ${requestedAccountEmail} has been approved.`,
    body: [
      "This mailbox is now activated in SK MailPilot.",
      "Return to MailPilot to connect the mailbox if needed, then run Sync inbox to bring messages into your workspace.",
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
      .select({ _id: 1 })
      .lean();

    if (existingActiveAccount) {
      res.status(200).json({
        success: true,
        data: {
          requestedAccountEmail,
          alreadyApproved: true,
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
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      state,
      loginHint: requestedAccountEmail,
    });

    res.status(200).json({
      success: true,
      data: {
        requestedAccountEmail,
        alreadyApproved: false,
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

  if (!requireAdmin(user.email)) {
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

    if (!requireAdmin(user.email)) {
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

    await sendEmailThroughGmail({
      to: recipients.join(","),
      subject: `MailPilot access approved for ${requestDoc.requestedAccountEmail}`,
      body: plainText,
      htmlBody: html,
    });

    const activeAccountsCount = await GmailAccountModel.countDocuments({
      userId: requestDoc.userId,
      status: "active",
    });
    const approvedAccount = await GmailAccountModel.findOneAndUpdate(
      {
        userId: requestDoc.userId,
        email: requestDoc.requestedAccountEmail,
      },
      {
        $set: {
          status: "active",
          isPrimary: activeAccountsCount === 0,
        },
      },
      {
        returnDocument: "after",
      }
    );

    if (approvedAccount && activeAccountsCount === 0) {
      await UserModel.findByIdAndUpdate(requestDoc.userId, {
        $set: {
          primaryAccountId: approvedAccount._id,
        },
      });
    }

    requestDoc.status = "approved";
    requestDoc.approvedAt = new Date();
    requestDoc.approvedByEmail = user.email;
    await requestDoc.save();

    await createNotification({
      userId: String(requestDoc.userId),
      type: "success",
      title: "Mailbox approved",
      message: `${requestDoc.requestedAccountEmail} is approved and ready to sync in MailPilot.`,
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

    if (!requireAdmin(user.email)) {
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
