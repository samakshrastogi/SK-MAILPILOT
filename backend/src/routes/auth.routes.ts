import express from "express";

import { requireAuth } from "../middleware/auth.middleware";
import {
  completeGoogleLogin,
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
  resendOtp,
  startGoogleLogin,
  updateProfile,
  verifyOtp,
} from "../controllers/auth.controller";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/google/start", startGoogleLogin);
router.get("/google/callback", completeGoogleLogin);
router.get("/me", requireAuth, me);
router.put("/profile", requireAuth, updateProfile);
router.post("/logout", requireAuth, logout);

export default router;
