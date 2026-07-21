import mongoose from "mongoose";
import { getRequiredNumberEnv } from "../config/env";
import { SystemSettingModel } from "../models/system-setting.model";

const SETTINGS_KEY = "mailpilot-global";
const normalizeLimit = (value: number) => Math.min(100, Math.max(1, Math.floor(value)));

export function getDefaultSyncEmailLimit() {
  const configured = getRequiredNumberEnv("FETCH_EMAILS_LIMIT");
  return normalizeLimit(Number.isFinite(configured) && configured > 0 ? configured : 25);
}

export async function getSyncEmailLimit() {
  if (mongoose.connection.readyState !== 1) return getDefaultSyncEmailLimit();
  const setting = await SystemSettingModel.findOne({ key: SETTINGS_KEY }).lean();
  return normalizeLimit(Number(setting?.syncEmailLimit ?? getDefaultSyncEmailLimit()));
}

export async function updateSyncEmailLimit(syncEmailLimit: number, updatedBy?: string | null) {
  const normalized = normalizeLimit(syncEmailLimit);
  const setting = await SystemSettingModel.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { syncEmailLimit: normalized, updatedBy: updatedBy?.trim() || null } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return { syncEmailLimit: normalizeLimit(Number(setting?.syncEmailLimit ?? normalized)), updatedBy: setting?.updatedBy ?? null, updatedAt: setting?.updatedAt ?? new Date() };
}
