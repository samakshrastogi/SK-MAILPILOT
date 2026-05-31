import crypto from "crypto";
import { getRequiredEnv, getRequiredNumberEnv } from "../config/env";

const sessionTtlDays = getRequiredNumberEnv("SESSION_TTL_DAYS");

function getSecret() {
  return getRequiredEnv("AUTH_SECRET");
}

export function createRandomToken(size = 32) {
  return crypto.randomBytes(size).toString("hex");
}

export function createNumericOtp(length = 6) {
  const max = 10 ** length;
  return crypto.randomInt(0, max).toString().padStart(length, "0");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), derived);
}

export function createSessionExpiry() {
  return new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000);
}

export function signState(payload: Record<string, string>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyState<T extends Record<string, string>>(value: string): T {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid OAuth state signature");
  }

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
}
