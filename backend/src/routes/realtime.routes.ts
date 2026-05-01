import express from "express";

import { openRealtimeStream } from "../controllers/realtime.controller";

const router = express.Router();

router.get("/stream", openRealtimeStream);

export default router;
