const express = require("express");
const router = express.Router();
const authController = require("../../controllers/auth/authController");

/**
 * @swagger
 * /auth/{email}/verify-email:
 *   get:
 *     summary: Verify User availability by email
 *     description: Check if a user exists in the system by providing an email address
 *     tags:
 *       - auth
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: The email address of the user whose availability needs to be checked.
 *     responses:
 *       200:
 *         description: The email is associated with an existing user account.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "User exists"
 *       404:
 *         description: No user account is associated with the given email address.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "User doesn't exist"
 *
 *
 */
router.get("/:email/verify-email", authController.verifyEmail);

/**
 * @swagger
 * /auth/{email}/send-code:
 *   get:
 *     summary: Send verification code
 *     description: Sends a verification code to the specified email address..
 *     tags:
 *       - auth
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           description: The email address to which the verification code will be sent
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           enum: ["en", "ko", "ja"]
 *           default: "en"
 *         example: "en"
 *         description: The language in which the verification email should be sent. Defaults to English.
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *           enum: ["verify", "initpassword"]
 *         example: "verify"
 *         description: Specifies the type of email template to be used.
 *                      "verify" for authentication verification, "initpassword" for password reset
 *     responses:
 *       200:
 *         description: The verification code was sent successfully to the provided email address
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Code sent successfully"
 *       404:
 *         description: An issue occurred while attempting to send the verification code.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Problem while sending code"
 *
 *
 */
router.get("/:email/send-code", authController.sendCode);

/**
 * @swagger
 * /auth/{email}/verify-code:
 *   post:
 *     summary: Verify user verification code
 *     description: Verifies the authentication code sent to the user's email
 *     tags:
 *       - auth
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           description: The email address of the user attempting to verify their code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: The verification code received by the user via email.
 *     responses:
 *       200:
 *         description: The verification code was successfully validated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Code verified successful"
 *       404:
 *         description: The provided verification code is invalid or expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Code verification failed"
 *
 *
 */
router.post("/:email/verify-code", authController.verifyCode);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: User Registration
 *     description: Registers a new user by collecting their email, password, and additional consent options. A verification code is required to complete the registration process
 *     tags:
 *       - auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: The email address of the user.
 *               password:
 *                 type: string
 *                 description: The password chosen by the user.
 *               code:
 *                 type: string
 *                 description: The verification code sent to the user's email.
 *               overage:
 *                 type: boolean
 *                 default: false
 *                 description: Indicates if the user is over the required age limit.
 *               agree:
 *                 type: boolean
 *                 default: false
 *                 description: Confirms the user has agreed to the terms and conditions.
 *               collect:
 *                 type: boolean
 *                 default: false
 *                 description: Consent for data collection.
 *               thirdParty:
 *                 type: boolean
 *                 default: false
 *                 description: Consent for sharing data with third parties.
 *               advertise:
 *                 type: boolean
 *                 default: false
 *                 description: Consent for receiving promotional content.
 *     responses:
 *       200:
 *         description: The user was successfully registered.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *       428:
 *         description: The authentication code provided does not match.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Authentication code does not match"
 *       404:
 *         description: An error occurred while attempting to register the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Problem while registering user"
 */
router.post("/register", authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User Login
 *     description: Authenticates a user by verifying their email and password. Upon successful authentication, an access token and refresh token are returned.
 *     tags:
 *       - auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: The registered email address of the user.
 *               password:
 *                 type: string
 *                 description: The user's password for authentication.
 *     responses:
 *       200:
 *         description: The user has been successfully authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: "Access token valid for 10 minutes."
 *                     refreshToken:
 *                       type: string
 *                       description: "Refresh token valid for 60 minutes."
 *                     expireIn:
 *                       type: number
 *                       description: "Token expiry time in seconds."
 *                       example: 600
 *                     address:
 *                       type: string
 *                       description: "User's wallet address."
 *                     isAdmin:
 *                       type: boolean
 *                       description: "Indicates if the user has admin privileges."
 *       404:
 *         description: Authentication failed due to incorrect credentials or non-existent user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Login failed"
 */
router.post("/login", authController.login);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Reissue Access and Refresh Tokens
 *     description: Allows users to obtain a new access token and refresh token using an existing refresh token. It helps maintain user authentication without requiring a full login
 *     tags:
 *       - auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: The refresh token used to generate new authentication tokens.
 *     responses:
 *       200:
 *         description: The access token has been successfully reissued.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Reissue access token successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: "New access token valid for 10 minutes."
 *                     refreshToken:
 *                       type: string
 *                       description: "New refresh token valid for 60 minutes."
 *                     expireIn:
 *                       type: number
 *                       description: "Token expiry time in seconds."
 *                       example: 600
 *       404:
 *         description: The token reissue process failed due to an invalid or expired refresh token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Reissue Accesstoken failed"
 */
router.post("/refresh-token", authController.refreshToken);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset Password
 *     description: Allows users to reset their password by providing their registered email, a new password, and a valid initpassword code received via email.
 *     tags:
 *       - auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: The registered email address of the user.
 *               password:
 *                 type: string
 *                 description: The new password that the user wants to set.
 *               code:
 *                 type: string
 *                 description: The initpassword code received via email for reset verification.
 *     responses:
 *       200:
 *         description: The password has been successfully reset.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Password reset successful"
 *       404:
 *         description: The password reset process failed due to an invalid email, incorrect authentication code, or other errors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Password Reset failed"
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change Password
 *     description: Allows users to change their password by providing their registered email, the old password, and a new password.
 *     tags:
 *       - auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: The registered email address of the user.
 *               oldpassword:
 *                 type: string
 *                 description: The current password of the user.
 *               newpassword:
 *                 type: string
 *                 description: The new password that the user wants to set.
 *     responses:
 *       200:
 *         description: The password has been successfully changed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: "Change Password successful"
 *       404:
 *         description: The password change process failed due to incorrect old password, invalid email, or other errors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 message:
 *                   type: string
 *                   example: "Change Password failed"
 */
router.post("/change-password", authController.changePassword);

module.exports = router;
