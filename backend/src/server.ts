import dotenv from "dotenv";

dotenv.config();

function normalizeProxyEnvironment() {
  const brokenProxyValues = new Set(["http://127.0.0.1:9", "https://127.0.0.1:9"]);

  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] as const) {
    const value = process.env[key]?.trim();
    if (value && brokenProxyValues.has(value)) {
      delete process.env[key];
    }
  }

  const noProxyEntries = new Set(
    (process.env.NO_PROXY ?? process.env.no_proxy ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  for (const host of [
    "localhost",
    "127.0.0.1",
    "::1",
    "oauth2.googleapis.com",
    "gmail.googleapis.com",
    "www.googleapis.com",
  ]) {
    noProxyEntries.add(host);
  }

  process.env.NO_PROXY = Array.from(noProxyEntries).join(",");
  process.env.no_proxy = process.env.NO_PROXY;
}

normalizeProxyEnvironment();

const port = Number(process.env.PORT ?? 5000);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});

async function bootstrap() {
  const [{ default: app }, { connectDB }, { startReplyScheduler }, { startComposeScheduler }] = await Promise.all([
    import("./app"),
    import("./config/db"),
    import("./services/reply-scheduler.service"),
    import("./services/compose-scheduler.service"),
  ]);

  if (process.env.MONGO_URI) {
    await connectDB();
  }

  startReplyScheduler();
  startComposeScheduler();

  app.listen(port, () => {
    console.log(`SK MailPilot backend running on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
