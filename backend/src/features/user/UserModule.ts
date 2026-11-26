import { Router } from "express";
import {
  getUserById,
  getUserByUsername,
  getRecommendedUsers,
  getNearbyUsers,
  searchUsers,
  updateUserProfile,
  blockUser,
  reportUser,
  getDiscoveryFeed,
  postDiscoveryImpression,
} from "./UserController";
import { requireAuth, optionalAuth } from "../../middlewares/authMiddleware";

const router = Router();

router.get("/api/users", optionalAuth, getRecommendedUsers);
router.get("/api/users/recommended", optionalAuth, getRecommendedUsers);
router.get('/api/users/discover', requireAuth, getDiscoveryFeed);
router.post('/api/users/discover/:sessionId/impressions', requireAuth, postDiscoveryImpression);
router.get("/api/users/nearby", optionalAuth, getNearbyUsers);
router.get("/api/users/search", searchUsers);
router.get("/api/users/username/:username", optionalAuth, getUserByUsername);
router.get("/api/users/:id", optionalAuth, getUserById);

// Protect update route
router.put("/api/users/:id", requireAuth, updateUserProfile);

router.post("/api/users/block", requireAuth, blockUser);
router.post("/api/users/report", requireAuth, reportUser);

export default router;
