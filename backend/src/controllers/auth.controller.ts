import type { Response } from "express";
import { z, ZodError } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { UserModel } from "../models/user.model";

const profileImageSchema = z.string().trim().refine(
  (value) => !value || /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value) || /^https?:\/\//.test(value),
  "Profile images must be uploaded image files"
);
const profileUpdateSchema = z.object({ coverPhotoUrl: profileImageSchema.optional() });

function toAuthUser(user: {
  _id: unknown; name: string; email: string; avatarUrl?: string; avatarInitials?: string; coverPhotoUrl?: string;
  emailVerified?: boolean; authProviders?: string[]; role?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    avatarInitials: user.avatarInitials ?? "",
    coverPhotoUrl: user.coverPhotoUrl ?? null,
    emailVerified: Boolean(user.emailVerified),
    authProviders: ["sk-central"],
    role: user.role ?? "member",
  };
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await UserModel.findById(req.auth?.userId).lean();
  if (!user) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  res.status(200).json({ success: true, data: { user: toAuthUser(user) } });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const payload = profileUpdateSchema.parse(req.body ?? {});
    const user = await UserModel.findByIdAndUpdate(
      req.auth?.userId,
      { $set: { coverPhotoUrl: payload.coverPhotoUrl || undefined } },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.status(200).json({ success: true, data: { user: toAuthUser(user.toObject()) } });
  } catch (error) {
    res.status(error instanceof ZodError ? 400 : 500).json({ success: false, error: error instanceof Error ? error.message : "Failed to update profile" });
  }
}
