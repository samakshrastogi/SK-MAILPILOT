import type { Request, Response } from "express";
import { z, ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { GmailAccountModel } from "../models/gmail-account.model";
import { SessionModel } from "../models/session.model";
import { UserModel } from "../models/user.model";
import {
  resetPasswordWithOtp,
  sendPasswordResetOtp,
  sendVerificationOtp,
  verifyEmailOtp,
} from "../services/email-verification.service";
import {
  exchangeGoogleCode,
  fetchGoogleProfileFromTokens,
  getGoogleAuthUrl,
} from "../services/google-oauth.service";
import {
  createRandomToken,
  createSessionExpiry,
  hashPassword,
  hashToken,
  signState,
  verifyPassword,
  verifyState,
} from "../utils/auth";

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().length(6),
  newPassword: z.string().min(8),
});

const verifyOtpSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().length(6),
});

const resendOtpSchema = z.object({
  email: z.string().trim().email(),
});

function normalizeReturnTo(value?: string) {
  if (!value) {
    return "/dashboard";
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

async function createSession(userId: string) {
  const token = createRandomToken();
  const session = await SessionModel.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: createSessionExpiry(),
  });

  return {
    token,
    sessionId: String(session._id),
  };
}

function toAuthUser(user: {
  _id: unknown;
  name: string;
  email: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  authProviders?: string[];
  role?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: Boolean(user.emailVerified),
    authProviders: user.authProviders ?? [],
    role: user.role ?? "member",
  };
}

function resolveUserRole(email: string) {
  const adminEmail = (process.env.MAIL_ACCESS_ADMIN_EMAIL ?? "samakshrastogi2512@gmail.com").trim().toLowerCase();
  return email.trim().toLowerCase() === adminEmail ? "admin" : "member";
}

export async function register(req: Request, res: Response) {
  try {
    const payload = registerSchema.parse(req.body ?? {});
    const email = payload.email.toLowerCase();
    const existing = await UserModel.findOne({ email }).lean();

    if (existing) {
      if (existing.emailVerified) {
        res.status(409).json({
          success: false,
          error: "An account with this email already exists",
        });
      } else {
        await sendVerificationOtp(String(existing._id));
        res.status(200).json({
          success: true,
          data: {
            pendingVerification: true,
            email,
          },
        });
      }
      return;
    }

    const passwordHash = await hashPassword(payload.password);
    const user = await UserModel.create({
      name: payload.name,
      email,
      passwordHash,
      emailVerified: false,
      authProviders: ["password"],
      role: resolveUserRole(email),
    });
    await sendVerificationOtp(String(user._id));

    res.status(201).json({
      success: true,
      data: {
        pendingVerification: true,
        email,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid registration request",
        details: error.flatten(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const payload = loginSchema.parse(req.body ?? {});
    const email = payload.email.toLowerCase();
    const user = await UserModel.findOne({ email });

    if (user && !user.emailVerified) {
      res.status(403).json({
        success: false,
        error: "Verify your email with the OTP before logging in",
      });
      return;
    }

    if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    const session = await createSession(String(user._id));

    res.status(200).json({
      success: true,
      data: {
        token: session.token,
        user: toAuthUser(user.toObject()),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid login request",
        details: error.flatten(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const payload = forgotPasswordSchema.parse(req.body ?? {});
    const user = await sendPasswordResetOtp(payload.email);

    res.status(200).json({
      success: true,
      data: {
        pendingPasswordReset: true,
        email: user.email,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid password reset request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to send password reset OTP",
    });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const payload = resetPasswordSchema.parse(req.body ?? {});
    const user = await resetPasswordWithOtp(payload.email, payload.otp, payload.newPassword);
    const session = await createSession(String(user._id));

    res.status(200).json({
      success: true,
      data: {
        token: session.token,
        user: toAuthUser(user.toObject()),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid password reset request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Password reset failed",
    });
  }
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const payload = verifyOtpSchema.parse(req.body ?? {});
    const user = await verifyEmailOtp(payload.email, payload.otp);
    const session = await createSession(String(user._id));

    res.status(200).json({
      success: true,
      data: {
        token: session.token,
        user: toAuthUser(user.toObject()),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid OTP verification request",
        details: error.flatten(),
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "OTP verification failed",
    });
  }
}

export async function resendOtp(req: Request, res: Response) {
  try {
    const payload = resendOtpSchema.parse(req.body ?? {});
    const user = await UserModel.findOne({ email: payload.email.toLowerCase() });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "No account found for this email",
      });
      return;
    }

    if (user.emailVerified) {
      res.status(409).json({
        success: false,
        error: "This account is already verified",
      });
      return;
    }

    await sendVerificationOtp(String(user._id));

    res.status(200).json({
      success: true,
      data: {
        pendingVerification: true,
        email: user.email,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid resend OTP request",
        details: error.flatten(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to resend OTP",
    });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const userDoc = await UserModel.findById(req.auth?.userId);

  if (!userDoc) {
    res.status(404).json({
      success: false,
      error: "User not found",
    });
    return;
  }

  if (!userDoc.avatarUrl && userDoc.googleSubject) {
    const account = await GmailAccountModel.findOne({
      userId: userDoc._id,
      status: "active",
      refreshToken: { $ne: null },
    }).lean();

    if (account?.refreshToken) {
      try {
        const profile = await fetchGoogleProfileFromTokens({
          refreshToken: account.refreshToken,
          accessToken: account.accessToken,
        });
        if (profile.picture) {
          userDoc.avatarUrl = profile.picture;
          await userDoc.save();
        }
      } catch {
        // Keep current response path stable; initials fallback covers UI.
      }
    }
  }

  res.status(200).json({
    success: true,
    data: {
      user: toAuthUser(userDoc.toObject()),
    },
  });
}

export async function logout(req: AuthenticatedRequest, res: Response) {
  await SessionModel.findByIdAndDelete(req.auth?.sessionId);
  res.status(200).json({
    success: true,
    data: {
      loggedOut: true,
    },
  });
}

export async function startGoogleLogin(_req: Request, res: Response) {
  try {
    const query = z
      .object({
        returnTo: z.string().trim().optional(),
      })
      .parse(_req.query);
    const state = signState({
      kind: "login",
      returnTo: normalizeReturnTo(query.returnTo),
    });

    const authUrl = getGoogleAuthUrl({
      redirectPath: "/api/auth/google/callback",
      scope: ["openid", "email", "profile"],
      state,
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
      error: error instanceof Error ? error.message : "Failed to start Google login",
    });
  }
}

export async function completeGoogleLogin(req: Request, res: Response) {
  try {
    const code = z.string().min(1).parse(req.query.code);
    const stateValue = z.string().min(1).parse(req.query.state);
    const state = verifyState<{ kind: string; returnTo?: string }>(stateValue);

    if (state.kind !== "login") {
      throw new Error("Unexpected Google login state");
    }

    const result = await exchangeGoogleCode({
      redirectPath: "/api/auth/google/callback",
      code,
    });

    let user = await UserModel.findOne({
      $or: [
        { googleSubject: result.profile.id },
        { email: result.profile.email },
      ],
    });

    if (!user) {
      user = await UserModel.create({
        name: result.profile.name,
        email: result.profile.email,
        avatarUrl: result.profile.picture,
        emailVerified: true,
        googleSubject: result.profile.id,
        authProviders: ["google"],
        role: resolveUserRole(result.profile.email),
      });
    } else {
      user.name = user.name || result.profile.name;
      user.email = result.profile.email;
      user.avatarUrl = result.profile.picture ?? user.avatarUrl;
      user.emailVerified = true;
      user.googleSubject = result.profile.id;
      user.role = user.role ?? resolveUserRole(result.profile.email);
      const authProviders = Array.isArray(user.authProviders) ? user.authProviders : [];
      if (!authProviders.includes("google")) {
        user.authProviders = [...authProviders, "google"];
      }
      await user.save();
    }

    const session = await createSession(String(user._id));

    res.status(200).type("html").send(
      authCompleteHtml({
        source: "sk-mailpilot-auth",
        type: "google-login-success",
        token: session.token,
        user: toAuthUser(user.toObject()),
      }, state.returnTo)
    );
  } catch (error) {
    res.status(200).type("html").send(
      authCompleteHtml({
        source: "sk-mailpilot-auth",
        type: "google-login-error",
        error: error instanceof Error ? error.message : "Google login failed",
      })
    );
  }
}
