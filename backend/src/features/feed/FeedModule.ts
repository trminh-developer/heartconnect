import { Router } from "express";
import {
  getStatuses,
  createStatus,
  toggleLike,
  addComment,
  getComments,
  deleteStatus,
  updateStatus,
  reportStatus,
} from "./FeedController";
import { requireAuth, optionalAuth } from "../../middlewares/authMiddleware";

const router = Router();

router.get("/api/feed/:userId", optionalAuth, getStatuses);
router.post("/api/feed", requireAuth, createStatus);
router.post("/api/feed/like", requireAuth, toggleLike);
router.get("/api/feed/:statusId/comments", requireAuth, getComments);
router.post("/api/feed/comment", requireAuth, addComment);
router.put("/api/feed/:statusId", requireAuth, updateStatus);
router.delete("/api/feed/:statusId", requireAuth, deleteStatus);
router.post("/api/feed/:statusId/report", requireAuth, reportStatus);

export default router;
