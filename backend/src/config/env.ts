const placeholderEnvPattern = /^(?:paste(?:_|-)|replace(?:_|-)?with|change(?:_|-)?me|your(?:_|-)|<)/i;

export function isPlaceholderEnvValue(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(normalized && placeholderEnvPattern.test(normalized));
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value || isPlaceholderEnvValue(value)) {
    throw new Error(name + " is missing or still contains a placeholder value");
  }

  return value;
}
export function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getRequiredNumberEnv(name: string) {
  const value = Number(getRequiredEnv(name));

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  return value;
}

export function getRequiredBooleanEnv(name: string) {
  const value = getRequiredEnv(name).toLowerCase();

  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be true or false`);
  }

  return value === "true";
}

export function getApiBaseUrl() {
  return getRequiredEnv("API_BASE_URL").replace(/\/$/, "");
}

export function getWebBaseUrl() {
  return getRequiredEnv("WEB_BASE_URL").replace(/\/$/, "");
}
