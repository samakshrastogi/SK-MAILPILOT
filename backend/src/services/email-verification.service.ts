import { UserModel } from "../models/user.model";
import { sendEmailThroughGmail } from "./gmail.service";
import { createNumericOtp, hashPassword, hashToken } from "../utils/auth";
import { buildBrandedEmail } from "./email-template.service";

const otpTtlMinutes = Number(process.env.EMAIL_VERIFICATION_OTP_TTL_MINUTES ?? 10);

function buildOtpEmail(name: string, otp: string) {
  const plainText = [
    `Hi ${name},`,
    "",
    "Use this OTP to verify your MailPilot account:",
    "",
    otp,
    "",
    `This code expires in ${otpTtlMinutes} minutes.`,
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `Your MailPilot verification code expires in ${otpTtlMinutes} minutes.`,
    eyebrow: "Account verification",
    title: "Verify your MailPilot account",
    greeting: `Hi ${name},`,
    intro: "Use this one-time password to confirm your email address and finish setting up your MailPilot account.",
    code: otp,
    footerNote: `This code expires in ${otpTtlMinutes} minutes. Never share this code with anyone.`,
  });

  return { plainText, html };
}

export async function sendVerificationOtp(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const otp = createNumericOtp(6);
  const { plainText, html } = buildOtpEmail(user.name, otp);

  user.emailVerificationOtpHash = hashToken(otp);
  user.emailVerificationOtpExpiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000);
  user.emailVerificationLastSentAt = new Date();
  await user.save();

  await sendEmailThroughGmail({
    to: user.email,
    subject: "Verify your MailPilot account",
    body: plainText,
    htmlBody: html,
  });
}

export async function verifyEmailOtp(email: string, otp: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user) {
    throw new Error("No account found for this email");
  }

  if (user.emailVerified) {
    return user;
  }

  if (!user.emailVerificationOtpHash || !user.emailVerificationOtpExpiresAt) {
    throw new Error("No OTP has been issued for this account");
  }

  if (user.emailVerificationOtpExpiresAt.getTime() < Date.now()) {
    throw new Error("OTP has expired");
  }

  if (user.emailVerificationOtpHash !== hashToken(otp.trim())) {
    throw new Error("Invalid OTP");
  }

  user.emailVerified = true;
  user.emailVerificationOtpHash = undefined;
  user.emailVerificationOtpExpiresAt = undefined;
  await user.save();

  return user;
}

function buildPasswordResetEmail(name: string, otp: string) {
  const plainText = [
    `Hi ${name},`,
    "",
    "Use this OTP to reset your MailPilot password:",
    "",
    otp,
    "",
    `This code expires in ${otpTtlMinutes} minutes.`,
  ].join("\n");

  const html = buildBrandedEmail({
    preheader: `Your MailPilot password reset code expires in ${otpTtlMinutes} minutes.`,
    eyebrow: "Password reset",
    title: "Reset your MailPilot password",
    greeting: `Hi ${name},`,
    intro: "Use this one-time password to reset your MailPilot password securely.",
    code: otp,
    footerNote: `This code expires in ${otpTtlMinutes} minutes. If you did not request a password reset, no action is required.`,
  });

  return { plainText, html };
}

export async function sendPasswordResetOtp(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user) {
    throw new Error("No account found for this email");
  }

  if (!user.emailVerified) {
    throw new Error("Verify your email before resetting the password");
  }

  const otp = createNumericOtp(6);
  const { plainText, html } = buildPasswordResetEmail(user.name, otp);

  user.passwordResetOtpHash = hashToken(otp);
  user.passwordResetOtpExpiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000);
  user.passwordResetLastSentAt = new Date();
  await user.save();

  await sendEmailThroughGmail({
    to: user.email,
    subject: "Reset your MailPilot password",
    body: plainText,
    htmlBody: html,
  });

  return user;
}

export async function resetPasswordWithOtp(email: string, otp: string, newPassword: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user) {
    throw new Error("No account found for this email");
  }

  if (!user.emailVerified) {
    throw new Error("Verify your email before resetting the password");
  }

  if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    throw new Error("No password reset OTP has been issued for this account");
  }

  if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
    throw new Error("OTP has expired");
  }

  if (user.passwordResetOtpHash !== hashToken(otp.trim())) {
    throw new Error("Invalid OTP");
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  user.passwordResetLastSentAt = undefined;

  if (!user.authProviders.includes("password")) {
    user.authProviders = [...user.authProviders, "password"];
  }

  await user.save();
  return user;
}
