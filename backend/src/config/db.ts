import mongoose from "mongoose";
import { ensureEmailNumericIds } from "../services/email-record.service";
import { EmailModel } from "../models/email.model";
import { UserModel } from "../models/user.model";
import { getRequiredEnv } from "./env";

export const connectDB = async () => {
  try {
    const mongoDbName = getRequiredEnv("MONGO_DB_NAME");

    await mongoose.connect(getRequiredEnv("MONGO_URI"), {
      dbName: mongoDbName,
    });

    const emailCollection = EmailModel.collection;
    const existingIndexes = await emailCollection.indexes();
    if (existingIndexes.some((index) => index.name === "messageId_1")) {
      await emailCollection.dropIndex("messageId_1");
    }
    await emailCollection.createIndex(
      { userId: 1, accountId: 1, messageId: 1 },
      {
        name: "userId_1_accountId_1_messageId_1",
        unique: true,
        sparse: true,
      }
    );

    await UserModel.updateMany(
      { googleSubject: null },
      { $unset: { googleSubject: 1 } }
    );
    await UserModel.updateMany(
      { emailVerified: { $exists: false } },
      {
        $set: { emailVerified: true },
        $unset: {
          emailVerificationOtpHash: 1,
          emailVerificationOtpExpiresAt: 1,
          emailVerificationLastSentAt: 1,
        },
      }
    );
    await UserModel.updateMany(
      {},
      {
        $unset: {
          passwordResetOtpHash: 1,
          passwordResetOtpExpiresAt: 1,
          passwordResetLastSentAt: 1,
        },
      }
    );
    await ensureEmailNumericIds();
    console.log(`✅ MongoDB Connected (${mongoDbName})`);
  } catch (error) {
    console.error("❌ DB Error:", error);
    process.exit(1);
  }
};
