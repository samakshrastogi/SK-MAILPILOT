export function getRequiredViteEnv(name: string) {
  const value = import.meta.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}
