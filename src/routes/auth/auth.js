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

module.exports = router;
