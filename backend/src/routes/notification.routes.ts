import express from "express";

import { requireAuth } from "../middleware/auth.middleware";
import {
  listNotifications,
  readAllNotifications,
  readNotification,
} from "../controllers/notification.controller";

const router = express.Router();

router.use(requireAuth);
router.get("/", listNotifications);
router.post("/read-all", readAllNotifications);
router.post("/:id/read", readNotification);

export default router;
