import { useMemo, useState } from "react";
import {
  FiBell,
  FiBriefcase,
  FiCamera,
  FiCheckCircle,
  FiClock,
  FiImage,
  FiLogOut,
  FiMail,
  FiSave,
  FiShield,
  FiUser,
} from "react-icons/fi";

import type { useMailPilotData } from "../hooks/useMailPilotData";
import type { AuthUser, GmailAccount, MailAccessRequest } from "../types/auth";
import type { AppNotification } from "../types/email";

type ProfilePageProps = {
  user: AuthUser;
  accounts: GmailAccount[];
  mailAccessRequests: MailAccessRequest[];
  notifications: AppNotification[];
  mailPilot: ReturnType<typeof useMailPilotData>;
  onSaveProfile: (payload: { coverPhotoUrl: string }) => Promise<void>;
  onLogout: () => void;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }
  return new Date(value).toLocaleString();
}

function readImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file"));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

export function ProfilePage({
  user,
  accounts,
  mailAccessRequests,
  notifications,
  mailPilot,
  onSaveProfile,
  onLogout,
}: ProfilePageProps) {
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(user.coverPhotoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState("");
  const [coverFileName, setCoverFileName] = useState("");

  const approvedRequests = mailAccessRequests.filter((request) => request.status === "approved");
  const pendingRequests = mailAccessRequests.filter((request) => request.status === "pending");
  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length;
  const primaryAccount = accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null;
  const authProviders = ["sk-central"];
  const topDomains = mailPilot.analytics?.topDomains ?? [];

  const profileCompletion = useMemo(() => {
    const checks = [
      Boolean(name.trim()),
      Boolean(avatarUrl.trim()),
      Boolean(coverPhotoUrl.trim()),
      user.emailVerified,
      accounts.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [accounts.length, avatarUrl, coverPhotoUrl, name, user.emailVerified]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      await onSaveProfile({ coverPhotoUrl: coverPhotoUrl.trim() });
      setSaveMessage("Profile updated");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(kind: "avatar" | "cover", file?: File) {
    if (!file) {
      return;
    }

    setSaveMessage(null);
    setSaveError(null);
    try {
      const dataUrl = await readImageFile(file);
      if (kind === "avatar") {
        setAvatarUrl(dataUrl);
        setAvatarFileName(file.name);
        setAvatarBroken(false);
      } else {
        setCoverPhotoUrl(dataUrl);
        setCoverFileName(file.name);
        setCoverBroken(false);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load image");
    }
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-44 bg-[linear-gradient(135deg,#0f172a,#0ea5e9)]">
          {coverPhotoUrl && !coverBroken ? (
            <img
              src={coverPhotoUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setCoverBroken(true)}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-end gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border-4 border-white bg-slate-900 shadow-lg">
                {avatarUrl && !avatarBroken ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="h-full w-full object-cover"
                    onError={() => setAvatarBroken(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-white">
                    {user.avatarInitials || getInitials(name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 pb-1 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Profile</p>
                <h2 className="truncate text-2xl font-semibold">{user.name}</h2>
                <p className="truncate text-sm text-white/80">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-white"
            >
              <FiLogOut />
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Profile complete", value: `${profileCompletion}%`, icon: FiUser },
          { label: "Connected mailboxes", value: accounts.length, icon: FiMail },
          { label: "Pending approvals", value: pendingRequests.length, icon: FiClock },
          { label: "Unread notifications", value: unreadNotifications, icon: FiBell },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
              </div>
              <item.icon className="shrink-0 text-lg text-slate-400" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">Edit</p>
                <h3 className="truncate text-base font-semibold text-slate-900">Identity and cover</h3>
              </div>
              <FiCamera className="shrink-0 text-slate-400" />
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Display name</span>
                <input
                  value={name}
                  disabled
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <FiCamera />
                      Profile picture
                    </span>
                    {false ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarUrl("");
                          setAvatarFileName("");
                          setAvatarBroken(false);
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50">
                    <FiImage />
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled
                      onChange={(event) => void handleImageUpload("avatar", event.target.files?.[0])}
                    />
                  </label>
                  <p className="mt-2 truncate text-xs text-slate-500">
                    {avatarFileName || (avatarUrl ? "Current image selected" : "Supports image files")}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <FiImage />
                      Cover photo
                    </span>
                    {coverPhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCoverPhotoUrl("");
                          setCoverFileName("");
                          setCoverBroken(false);
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50">
                    <FiImage />
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => void handleImageUpload("cover", event.target.files?.[0])}
                    />
                  </label>
                  <p className="mt-2 truncate text-xs text-slate-500">
                    {coverFileName || (coverPhotoUrl ? "Current image selected" : "Supports image files")}
                  </p>
                </div>
              </div>

              {saveMessage ? <p className="text-sm font-medium text-emerald-700">{saveMessage}</p> : null}
              {saveError ? <p className="text-sm font-medium text-rose-700">{saveError}</p> : null}

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiSave />
                {saving ? "Saving..." : "Save cover photo"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">Access identity</h3>
              <FiShield className="text-slate-400" />
            </div>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {[
                ["Role", user.role],
                ["Email verified", user.emailVerified ? "Verified" : "Not verified"],
                ["Sign-in methods", authProviders.join(", ")],
                ["Primary mailbox", primaryAccount?.email ?? "Not connected"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="min-w-0 truncate text-right font-medium capitalize text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">Mailbox access</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {approvedRequests.length} approved
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {accounts.length ? (
                accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{account.email}</p>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Connected
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {account.isPrimary ? "Primary mailbox" : "Secondary mailbox"} since {formatDate(account.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No connected Gmail mailbox yet.
                </p>
              )}

              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-amber-950">{request.requestedAccountEmail}</p>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Pending
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-800">Requested {formatDate(request.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">Sync state</h3>
                <FiCheckCircle className="text-slate-400" />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Last sync</span>
                  <span className="font-medium text-slate-900">{formatDate(mailPilot.lastSyncAt)}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Last fetched</span>
                  <span className="font-medium text-slate-900">{mailPilot.lastSyncResult?.fetchedCount ?? 0}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Failed</span>
                  <span className="font-medium text-slate-900">{mailPilot.lastSyncResult?.failedCount ?? 0}</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">Inbox profile</h3>
                <FiBriefcase className="text-slate-400" />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Active emails</span>
                  <span className="font-medium text-slate-900">{mailPilot.stats?.totalEmails ?? 0}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Replies pending</span>
                  <span className="font-medium text-slate-900">{mailPilot.followUps?.count ?? 0}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-500">Reply rate</span>
                  <span className="font-medium text-slate-900">{mailPilot.analytics?.replyRate ?? 0}%</span>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">Top sender domains</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {topDomains.length} tracked
              </span>
            </div>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {topDomains.slice(0, 5).length ? (
                topDomains.slice(0, 5).map((domain) => (
                  <div key={domain.domain} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800">{domain.domain}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {domain.count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-slate-500">Domain data appears after inbox sync.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
