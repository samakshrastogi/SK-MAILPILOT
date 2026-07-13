import crypto from "crypto";
import { getRequiredEnv } from "../config/env";

function getSecret() {
  return getRequiredEnv("AUTH_SECRET");
}

export function signState(payload: Record<string, string>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyState<T extends Record<string, string>>(value: string): T {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid OAuth state");
  const expected = crypto.createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid OAuth state signature");
  }
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
}
