const express = require("express");
const router = express.Router();
const {
  verifyEmail,
  sendCode,
  verifyCodeController,
  register,
  loginController,
  refreshTokenController,
} = require("../../controllers/auth/authController");

/**
 * @route GET /api/auth/:email/verify-email
 * @desc Verify if email exists
 * @access Public
 */
router.get("/:email/verify-email", verifyEmail);

/**
 * @route GET/POST /api/auth/:email/send-code
 * @desc Send verification code to email
 * @access Public
 */
router.get("/:email/send-code", sendCode);
router.post("/:email/send-code", sendCode);

/**
 * @route POST /api/auth/:email/verify-code
 * @desc Verify the code sent to email
 * @access Public
 */
router.post("/:email/verify-code", verifyCodeController);

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post("/register", register);

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post("/login", loginController);

/**
 * @route POST /api/auth/refresh-token
 * @desc Refresh access token
 * @access Public
 */
router.post("/refresh-token", refreshTokenController);

module.exports = router;
