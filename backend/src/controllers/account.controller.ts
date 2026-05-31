import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { GmailAccountModel } from "../models/gmail-account.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { UserModel } from "../models/user.model";
import { exchangeGoogleCode, getGoogleAuthUrl } from "../services/google-oauth.service";
import { sendEmailThroughGmail } from "../services/gmail.service";
import { buildAppUrl, buildBrandedEmail } from "../services/email-template.service";
import { createNotification } from "../services/notification.service";
import { recordAuditEvent } from "../services/audit.service";
import { signState, verifyState } from "../utils/auth";

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

function normalizeReturnTo(value?: string) {
  if (!value) {
    return "/emails";
  }

  return value.startsWith("/") ? value : `/${value.replace(/^#?\/?/, "")}`;
}

function authCompleteHtml(payload: Record<string, unknown>, returnTo?: string) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  const frontendBaseUrl = (process.env.WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const normalizedReturnTo = normalizeReturnTo(returnTo);
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; padding: 24px;">
    <script>
      (function () {
        var payload = ${serialized};
        payload;
        window.location.replace("${frontendBaseUrl}/?oauthResult=${encodedPayload}#${normalizedReturnTo}");
      })();
    </script>
    <p>Redirecting back to MailPilot...</p>
  </body>
</html>`;
}

function buildPendingApprovalEmail(requesterName: string, requesterEmail: string, requestedAccountEmail: string, requestId: string) {
  const plainText = [
    "A MailPilot mailbox request has been verified through Google and is ready for admin approval.",
    "",
    `Requester: ${requesterName}`,
    `Login email: ${requesterEmail}`,
    `Verified mailbox: ${requestedAccountEmail}`,
    `Request id: ${requestId}`,
    "",
    "Review this request in MailPilot:",
    buildAppUrl("/mail-access"),
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `${requestedAccountEmail} is verified and waiting for admin approval.`,
    eyebrow: "Admin review",
    title: "New mailbox approval request",
    greeting: "Hi Admin,",
    intro: "A MailPilot mailbox request has been verified through Google and is ready for review.",
    details: [
      { label: "Requester", value: requesterName },
      { label: "Login email", value: requesterEmail },
      { label: "Verified mailbox", value: requestedAccountEmail },
      { label: "Request ID", value: requestId },
    ],
    action: {
      label: "Review request",
      url: buildAppUrl("/mail-access"),
    },
    footerNote: "Approve only if this user should be allowed to sync and manage the verified mailbox in SK MailPilot.",
  });

  return { plainText, html };
}

export async function listAccounts(req: AuthenticatedRequest, res: Response) {
  const accounts = await GmailAccountModel.find({
    userId: req.auth?.userId,
    status: "active",
  })
    .sort({ isPrimary: -1, createdAt: 1 })
    .lean();

  res.status(200).json({
    success: true,
    data: accounts
      .filter((account) => hasRequiredGmailScopes(account.scope))
      .map((account) => ({
        id: String(account._id),
        email: account.email,
        displayName: account.displayName,
        provider: account.provider,
        isPrimary: account.isPrimary,
        createdAt: account.createdAt,
      })),
  });
}

export async function startGoogleAccountConnect(req: AuthenticatedRequest, res: Response) {
  try {
    const query = z
      .object({
        requestedAccountEmail: z.string().trim().email().optional(),
        returnTo: z.string().trim().optional(),
      })
      .parse(req.query);
    const user = await UserModel.findById(req.auth?.userId).select({ email: 1 }).lean();
    if (!req.auth?.userId || !user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const requestedAccountEmail = query.requestedAccountEmail?.toLowerCase();
    const isAdmin = user.email.trim().toLowerCase() ===
      (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com").trim().toLowerCase();

    if (requestedAccountEmail && !isAdmin) {
      const approvedRequest = await MailAccessRequestModel.findOne({
        requesterEmail: user.email,
        requestedAccountEmail,
        status: "approved",
      })
        .select({ _id: 1 })
        .lean();

      if (!approvedRequest) {
        res.status(403).json({
          success: false,
          error: "This mail is not approved for MailPilot yet",
        });
        return;
      }
    }

    const state = signState({
      kind: "connect-account",
      userId: req.auth?.userId ?? "",
      requestedAccountEmail: requestedAccountEmail ?? "",
      returnTo: normalizeReturnTo(query.returnTo),
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
        authUrl,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start Gmail connect",
    });
  }
}

export async function completeGoogleAccountConnect(req: AuthenticatedRequest, res: Response) {
  try {
    const code = z.string().min(1).parse(req.query.code);
    const stateValue = z.string().min(1).parse(req.query.state);
    const state = verifyState<{ kind: string; userId: string; requestedAccountEmail?: string; returnTo?: string }>(
      stateValue
    );

    if (!["connect-account", "request-mail-access"].includes(state.kind) || !state.userId) {
      throw new Error("Unexpected account connection state");
    }

    const result = await exchangeGoogleCode({
      redirectPath: "/api/accounts/google/callback",
      code,
    });
    const callbackScope = z.string().trim().optional().parse(req.query.scope);
    const user = await UserModel.findById(state.userId).select({ name: 1, email: 1, primaryAccountId: 1 }).lean();
    const isAdmin =
      user?.email?.trim().toLowerCase() ===
      (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com").trim().toLowerCase();
    const requestedAccountEmail = state.requestedAccountEmail?.trim().toLowerCase();

    if (requestedAccountEmail && result.profile.email !== requestedAccountEmail) {
      throw new Error(`Sign in with ${requestedAccountEmail} to connect this approved mail`);
    }

    if (requestedAccountEmail && state.kind === "connect-account" && !isAdmin) {
      const approvedRequest = await MailAccessRequestModel.findOne({
        requesterEmail: user?.email,
        requestedAccountEmail,
        status: "approved",
      })
        .select({ _id: 1 })
        .lean();

      if (!approvedRequest) {
        throw new Error("This mail is not approved for MailPilot yet");
      }
    }

    const grantedScopes = new Set(
      String(result.tokens.scope ?? callbackScope ?? "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean)
    );

    if (!requiredGmailScopes.every((scope) => grantedScopes.has(scope))) {
      throw new Error(
        "Google did not grant the required Gmail permissions. Reconnect this mail and approve Gmail read, modify, and send access."
      );
    }

    const existingAccounts = await GmailAccountModel.countDocuments({
      userId: state.userId,
      status: "active",
    });
    const existingAccount = await GmailAccountModel.findOne({
      userId: state.userId,
      email: result.profile.email,
    });

    if (state.kind === "request-mail-access") {
      if (!requestedAccountEmail) {
        throw new Error("Requested mailbox is missing from the verification flow");
      }

      const approvedRequest = await MailAccessRequestModel.findOne({
        requesterEmail: user?.email,
        requestedAccountEmail,
        status: "approved",
      })
        .select({ _id: 1 })
        .lean();

      const accountStatus = approvedRequest ? "active" : "pending_approval";
      const account = await GmailAccountModel.findOneAndUpdate(
        {
          userId: state.userId,
          email: result.profile.email,
        },
        {
          $set: {
            provider: "google",
            displayName: result.profile.name,
            googleSubject: result.profile.id,
            accessToken: result.tokens.access_token ?? existingAccount?.accessToken ?? null,
            refreshToken: result.tokens.refresh_token ?? existingAccount?.refreshToken ?? null,
            scope: String(result.tokens.scope ?? callbackScope ?? ""),
            tokenExpiryDate: result.tokens.expiry_date
              ? new Date(result.tokens.expiry_date)
              : existingAccount?.tokenExpiryDate ?? null,
            status: accountStatus,
            isPrimary: existingAccount?.isPrimary ?? existingAccounts === 0,
            ownerUserId: existingAccount?.ownerUserId ?? state.userId,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        }
      );

      if (accountStatus === "active" && existingAccounts === 0) {
        await UserModel.findByIdAndUpdate(state.userId, {
          $set: {
            primaryAccountId: account._id,
          },
        });
      }

      if (!approvedRequest) {
        const requestDoc = await MailAccessRequestModel.findOneAndUpdate(
          {
            requesterEmail: user?.email,
            requestedAccountEmail,
          },
          {
            $set: {
              userId: state.userId,
              requesterName: user?.name ?? result.profile.name,
              requesterEmail: user?.email ?? result.profile.email,
              loginEmail: user?.email ?? result.profile.email,
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
          const pendingApprovalEmail = buildPendingApprovalEmail(
            user?.name ?? result.profile.name,
            user?.email ?? result.profile.email,
            requestedAccountEmail,
            String(requestDoc._id)
          );

          await sendEmailThroughGmail({
            to: (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com").trim().toLowerCase(),
            subject: `Mail access request pending approval: ${requestedAccountEmail}`,
            body: pendingApprovalEmail.plainText,
            htmlBody: pendingApprovalEmail.html,
          });

          requestDoc.notificationSentAt = new Date();
          await requestDoc.save();
        } catch {
          // Keep the request pending even if the admin notification fails.
        }

        await createNotification({
          userId: state.userId,
          type: "info",
          title: "Mailbox sent for approval",
          message: `${requestedAccountEmail} was verified with Google and is now waiting for admin approval.`,
          metadata: {
            kind: "mail-access-pending",
            requestedAccountEmail,
            requestId: String(requestDoc._id),
          },
        });
        await recordAuditEvent({
          userId: state.userId,
          actorUserId: state.userId,
          kind: "mail-access-requested",
          title: `Mailbox verification completed for ${requestedAccountEmail}`,
          status: "info",
          targetType: "mailbox-request",
          targetId: String(requestDoc._id),
          details: {
            requestedAccountEmail,
            status: "pending",
          },
        });

        const adminUser = await UserModel.findOne({
          email: (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com").trim().toLowerCase(),
        })
          .select({ _id: 1 })
          .lean();

        if (adminUser?._id) {
          await createNotification({
            userId: String(adminUser._id),
            type: "warning",
            title: "New mailbox approval request",
            message: `${requestedAccountEmail} was verified and is waiting for approval.`,
            metadata: {
              kind: "mail-access-admin-review",
              requestedAccountEmail,
              requestId: String(requestDoc._id),
              requesterEmail: user?.email ?? result.profile.email,
            },
          });
        }
      } else {
        await createNotification({
          userId: state.userId,
          type: "success",
          title: "Mailbox ready to connect",
          message: `${requestedAccountEmail} is already approved and can now be connected for sync.`,
          metadata: {
            kind: "mail-access-approved",
            requestedAccountEmail,
          },
        });
        await recordAuditEvent({
          userId: state.userId,
          actorUserId: state.userId,
          kind: "mail-access-ready",
          title: `Approved mailbox ready: ${requestedAccountEmail}`,
          status: "success",
          targetType: "mailbox",
          details: {
            requestedAccountEmail,
          },
        });
      }

      res.status(200).type("html").send(
        authCompleteHtml(
          {
            source: "sk-mailpilot-auth",
            type: "mail-access-request-success",
            requestedAccountEmail,
            status: approvedRequest ? "approved" : "pending",
            account: {
              email: result.profile.email,
            },
          },
          state.returnTo
        )
      );
      return;
    }

    const account = await GmailAccountModel.findOneAndUpdate(
      {
        userId: state.userId,
        email: result.profile.email,
      },
      {
        $set: {
          provider: "google",
          displayName: result.profile.name,
          googleSubject: result.profile.id,
          accessToken: result.tokens.access_token ?? existingAccount?.accessToken ?? null,
          refreshToken: result.tokens.refresh_token ?? existingAccount?.refreshToken ?? null,
          scope: String(result.tokens.scope ?? callbackScope ?? ""),
          tokenExpiryDate: result.tokens.expiry_date
            ? new Date(result.tokens.expiry_date)
            : existingAccount?.tokenExpiryDate ?? null,
          status: "active",
          isPrimary: existingAccount?.isPrimary ?? existingAccounts === 0,
          ownerUserId: existingAccount?.ownerUserId ?? state.userId,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );

    await UserModel.findByIdAndUpdate(state.userId, {
      $set: {
        primaryAccountId:
          existingAccounts === 0 ? account._id : undefined,
      },
    });

    await createNotification({
      userId: state.userId,
      type: "success",
      title: "Gmail connected",
      message: `${result.profile.email} is connected and ready to sync.`,
      metadata: {
        kind: "gmail-connected",
        accountEmail: result.profile.email,
      },
    });
    await recordAuditEvent({
      userId: state.userId,
      actorUserId: state.userId,
      kind: "gmail-connected",
      title: `Gmail connected: ${result.profile.email}`,
      status: "success",
      targetType: "mailbox",
      targetId: String(account._id),
      details: {
        email: result.profile.email,
      },
    });

    res.status(200).type("html").send(
      authCompleteHtml({
        source: "sk-mailpilot-auth",
        type: "google-account-success",
        account: {
          id: String(account._id),
          email: account.email,
          displayName: account.displayName,
          isPrimary: account.isPrimary,
        },
      }, state.returnTo)
    );
  } catch (error) {
    res.status(200).type("html").send(
      authCompleteHtml({
        source: "sk-mailpilot-auth",
        type: "google-account-error",
        error: error instanceof Error ? error.message : "Failed to connect Gmail account",
      })
    );
  }
}
