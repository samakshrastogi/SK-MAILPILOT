import { Schema, model, models } from "mongoose";

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    syncEmailLimit: { type: Number, required: true, min: 1, max: 100 },
    updatedBy: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

export const SystemSettingModel = models.SystemSetting || model("SystemSetting", systemSettingSchema);
