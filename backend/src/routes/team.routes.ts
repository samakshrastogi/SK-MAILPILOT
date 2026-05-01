import express from "express";

import { listTeamOverview, updateMailboxAssignments, updateUserRole } from "../controllers/team.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.use(requireAuth);
router.get("/", listTeamOverview);
router.put("/users/:id/role", updateUserRole);
router.put("/mailboxes/:id/assignments", updateMailboxAssignments);

export default router;
