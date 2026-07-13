import express from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { me, updateProfile } from "../controllers/auth.controller";

const router = express.Router();
router.get("/me", requireAuth, me);
router.put("/profile", requireAuth, updateProfile);
export default router;
