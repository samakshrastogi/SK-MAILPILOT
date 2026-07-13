import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { logger } from "../utils/logger";
import { getOptionalEnv, getRequiredBooleanEnv, getRequiredNumberEnv } from "../config/env";

const geminiApiKey = getOptionalEnv("GEMINI_API_KEY");
const geminiModel = getOptionalEnv("GEMINI_MODEL") ?? "gemini-2.5-flash";
const ollamaBaseUrl = getOptionalEnv("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434";
const ollamaModel = getOptionalEnv("OLLAMA_MODEL") ?? "llama3.2";
const llmTimeoutMs = getRequiredNumberEnv("LLM_TIMEOUT_MS");
const llmFailureCooldownMs = getRequiredNumberEnv("LLM_FAILURE_COOLDOWN_MS");
export const llmEnabled = getRequiredBooleanEnv("EMAIL_ANALYSIS_LLM_ENABLED");
export const llmProvider = geminiApiKey ? "gemini" : "ollama";

let llmCooldownUntil = 0;
let lastCooldownWarningAt = 0;

export const llm: BaseChatModel = geminiApiKey
  ? new ChatGoogleGenerativeAI({ apiKey: geminiApiKey, model: geminiModel, temperature: 0 })
  : new ChatOllama({ baseUrl: ollamaBaseUrl, model: ollamaModel, temperature: 0 });

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
        provider: llmProvider,
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
        provider: llmProvider,
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
      provider: llmProvider,
      error: error instanceof Error ? error.message : "Unknown error",
      cooldownMs: llmFailureCooldownMs,
    });
    return fallback();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
