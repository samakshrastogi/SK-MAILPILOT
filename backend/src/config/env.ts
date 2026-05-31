export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
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

export function getMailAccessAdminEmail() {
  return getRequiredEnv("MAIL_ACCESS_ADMIN_EMAIL").toLowerCase();
}
