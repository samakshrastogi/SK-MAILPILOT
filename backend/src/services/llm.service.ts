import { ChatOllama } from "@langchain/ollama";
import { logger } from "../utils/logger";
import { getRequiredBooleanEnv, getRequiredEnv, getRequiredNumberEnv } from "../config/env";

const baseUrl = getRequiredEnv("OLLAMA_BASE_URL");
const model = getRequiredEnv("OLLAMA_MODEL");
const llmTimeoutMs = getRequiredNumberEnv("LLM_TIMEOUT_MS");
const llmFailureCooldownMs = getRequiredNumberEnv("LLM_FAILURE_COOLDOWN_MS");
export const llmEnabled = getRequiredBooleanEnv("EMAIL_ANALYSIS_LLM_ENABLED");

let llmCooldownUntil = 0;
let lastCooldownWarningAt = 0;

export const llm = new ChatOllama({
  baseUrl,
  model,
  temperature: 0,
});

export const llmLimits = {
  maxInputChars: 1000,
  skipThresholdChars: 3000,
  timeoutMs: llmTimeoutMs,
};

export function prepareEmailBodyForLlm(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, llmLimits.maxInputChars);
}

export function shouldSkipLlm(body: string) {
  return body.length > llmLimits.skipThresholdChars;
}

export async function withLlmTimeout<T>(
  operation: Promise<T>,
  label: string,
  fallback: () => T | Promise<T>
): Promise<T> {
  if (!llmEnabled && (label === "analyzeEmail" || label === "generateReply")) {
    return fallback();
  }

  if (Date.now() < llmCooldownUntil) {
    if (Date.now() - lastCooldownWarningAt > 30000) {
      logger.warn("LLM temporarily disabled, using fallback", {
        label,
        cooldownMsRemaining: llmCooldownUntil - Date.now(),
      });
      lastCooldownWarningAt = Date.now();
    }

    return fallback();
  }

  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;

  const guardedOperation = operation.catch((error) => {
    if (timedOut) {
      logger.warn("LLM operation failed after timeout window", {
        label,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return fallback();
    }

    throw error;
  });

  try {
    return await Promise.race([
      guardedOperation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`${label} timed out after ${llmTimeoutMs}ms`));
        }, llmTimeoutMs);
      }),
    ]);
  } catch (error) {
    llmCooldownUntil = Date.now() + llmFailureCooldownMs;
    lastCooldownWarningAt = Date.now();
    logger.warn("LLM operation failed, using fallback", {
      label,
      error: error instanceof Error ? error.message : "Unknown error",
      cooldownMs: llmFailureCooldownMs,
    });

    return fallback();
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
