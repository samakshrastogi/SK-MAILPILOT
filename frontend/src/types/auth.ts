export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  emailVerified: boolean;
  authProviders: string[];
  role: "member" | "reviewer" | "admin";
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type GmailAccount = {
  id: string;
  email: string;
  displayName: string;
  provider: string;
  isPrimary: boolean;
  createdAt: string;
};

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: "member" | "reviewer" | "admin";
  createdAt: string;
};

export type TeamMailbox = {
  id: string;
  email: string;
  status: string;
  ownerUserId: string | null;
  reviewerUserIds: string[];
  createdAt: string;
};

export type MailAccessRequestStatus = "pending" | "approved";

export type MailAccessRequest = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  loginEmail: string;
  requestedAccountEmail: string;
  status: MailAccessRequestStatus;
  notificationSentAt: string | null;
  requestedEmailVerifiedAt: string | null;
  approvedAt: string | null;
  approvedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingVerificationResponse = {
  pendingVerification: true;
  email: string;
};

export type PendingPasswordResetResponse = {
  pendingPasswordReset: true;
  email: string;
};
