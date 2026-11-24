import { Router } from "express";
import {
  revokeUserVerification,
  updateUserRole,
  getAllStatuses,
  deleteStatus,
  getAllReports,
  resolveReport,
  submitVerification,
  getAllUsers,
  toggleUserStatus,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  getSystemSettings,
  updateSystemSettings,
  resetUserViolations,
  getVerificationDetail,
  setPostVisibility,
  deleteUser,
} from "./AdminController";
import { getAdminAnalytics, getAdminOverview } from './AdminStatistics';
import { requireAuth, requireAdmin } from "../../middlewares/authMiddleware";

const router = Router();
router.get('/api/admin/overview', requireAuth, requireAdmin, getAdminOverview);
router.get('/api/admin/analytics', requireAuth, requireAdmin, getAdminAnalytics);
router.get('/api/admin/verifications/:id', requireAuth, requireAdmin, getVerificationDetail);
router.put('/api/admin/feed/:id/visibility', requireAuth, requireAdmin, setPostVisibility);

// Protected admin routes
router.get(
  "/api/admin/verifications",
  requireAuth,
  requireAdmin,
  getPendingVerifications,
);
router.post(
  "/api/admin/verifications/:id/approve",
  requireAuth,
  requireAdmin,
  approveVerification,
);
router.post(
  "/api/admin/verifications/:id/reject",
  requireAuth,
  requireAdmin,
  rejectVerification,
);

router.get("/api/admin/users", requireAuth, requireAdmin, getAllUsers);
router.put(
  "/api/admin/users/:id/status",
  requireAuth,
  requireAdmin,
  toggleUserStatus,
);
router.put(
  "/api/admin/users/:id/role",
  requireAuth,
  requireAdmin,
  updateUserRole,
);
router.put(
  "/api/admin/users/:id/verification/revoke",
  requireAuth,
  requireAdmin,
  revokeUserVerification,
);
router.put(
  "/api/admin/users/:id/reset-violations",
  requireAuth,
  requireAdmin,
  resetUserViolations,
);
router.delete(
  "/api/admin/users/:id",
  requireAuth,
  requireAdmin,
  deleteUser,
);

router.get("/api/admin/feed", requireAuth, requireAdmin, getAllStatuses);
router.delete("/api/admin/feed/:id", requireAuth, requireAdmin, deleteStatus);
router.get("/api/admin/reports", requireAuth, requireAdmin, getAllReports);
router.put("/api/admin/reports/:id", requireAuth, requireAdmin, resolveReport);

// System Settings
router.get("/api/admin/settings", requireAuth, requireAdmin, getSystemSettings);
router.put(
  "/api/admin/settings",
  requireAuth,
  requireAdmin,
  updateSystemSettings,
);

// Verification submittal by users (auth required)
router.post("/api/users/:id/verification", requireAuth, submitVerification);

export default router;
