import { Schema, model, models } from "mongoose";

const counterSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    versionKey: false,
  }
);

export const CounterModel = models.Counter ?? model("Counter", counterSchema);
