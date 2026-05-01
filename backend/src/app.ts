import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import accountRoutes from "./routes/account.routes";
import emailRoutes from "./routes/email.routes";
import composeRoutes from "./routes/compose.routes";
import mailAccessRoutes from "./routes/mail-access.routes";
import notificationRoutes from "./routes/notification.routes";
import realtimeRoutes from "./routes/realtime.routes";
import auditRoutes from "./routes/audit.routes";
import teamRoutes from "./routes/team.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("SK MailPilot API Running");
});

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/compose", composeRoutes);
app.use("/api/mail-access", mailAccessRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/team", teamRoutes);

export default app;
