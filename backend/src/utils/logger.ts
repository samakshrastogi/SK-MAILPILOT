type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatMeta(meta?: Record<string, unknown>) {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserializable-meta]";
  }
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}${formatMeta(meta)}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    write("INFO", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    write("WARN", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    write("ERROR", message, meta);
  },
  debug(message: string, meta?: Record<string, unknown>) {
    write("DEBUG", message, meta);
  },
};
