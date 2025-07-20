const express = require("express");
const router = express.Router();
const authController = require("../../controllers/auth/authController");
const auth = require("../../middleware/auth");

router.get("/:email/verify-email", authController.verifyEmail);

router.get("/:email/send-code", authController.sendCode);

router.post("/:email/verify-code", authController.verifyCode);

router.post("/register", authController.register);

router.post("/login", authController.login);

router.post("/refresh-token", authController.refreshToken);

router.post("/reset-password", authController.resetPassword);

router.post("/change-password", authController.changePassword);

// GET /api/auth/account
router.get("/account", auth, authController.getAccount);

// Get account balance
router.get("/balance", auth, authController.getAccountBalance);

// 소셜 로그인 관련 라우트들
// GET /api/auth/social/login-url?provider=google&callbackUrl=...
router.get("/social/login-url", authController.getSocialLoginUrl);

// MPC 지갑 관련 라우트들
// POST /api/auth/mpc/wallet/create-or-recover
router.post(
  "/mpc/wallet/create-or-recover",
  authController.createOrRecoverMpcWallet
);

// POST /api/auth/mpc/wallet/validate
router.post("/mpc/wallet/validate", auth, authController.validateMpcWalletData);

// POST /api/auth/social/finalize
router.post("/social/finalize", authController.finalizeSocialLogin);

// POST /api/auth/social/register
router.post("/social/register", authController.socialRegister);

// POST /api/auth/social/login-full
router.post("/social/login-full", authController.socialLoginFull);

// MPC 지갑 데이터 관련 라우트 (세션 관리 아님)
router.post("/mpc/wallet/clear", auth, authController.clearWalletData);

// 소셜 로그인 + MPC 지갑 통합 플로우
router.post("/social/complete-flow", authController.socialLoginCompleteFlow);

module.exports = router;
