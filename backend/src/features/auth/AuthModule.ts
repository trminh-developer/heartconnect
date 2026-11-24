import { Router } from "express";
import { AuthController } from "./AuthController";
import { requireAuth } from '../../middlewares/authMiddleware';
export function initAuthModule() {
  const router = Router();
  const controller = new AuthController();
  router.post("/login", controller.login.bind(controller));
  router.post("/register", controller.register.bind(controller));
  router.post("/refresh", controller.refresh.bind(controller));
  router.post("/logout", controller.logout.bind(controller));
  router.post("/forgot-password", controller.forgotPassword.bind(controller));
  router.post("/verify-otp", controller.verifyOTP.bind(controller));
  router.post("/reset-password", controller.resetPassword.bind(controller));
  router.get("/me", requireAuth, controller.me.bind(controller));
  return router;
}
