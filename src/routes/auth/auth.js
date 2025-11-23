const express = require("express");
const router = express.Router();
const authController = require("../../controllers/auth/authController");
const auth = require("../../middleware/auth");

/**
 * @swagger
 * /api/auth/{email}/verify-email:
 *   get:
 *     summary: 이메일 확인
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 이메일 확인 성공
 */
router.get("/:email/verify-email", authController.verifyEmail);

/**
 * @swagger
 * /api/auth/{email}/send-code:
 *   get:
 *     summary: 인증 코드 발송
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *         description: 언어 코드
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 인증 코드 발송 성공
 */
router.get("/:email/send-code", authController.sendCode);

/**
 * @swagger
 * /api/auth/{email}/verify-code:
 *   post:
 *     summary: 인증 코드 확인
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 인증 코드 확인 성공
 */
router.post("/:email/verify-code", authController.verifyCode);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 회원가입
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               code:
 *                 type: string
 *               overage:
 *                 type: boolean
 *               agree:
 *                 type: boolean
 *               collect:
 *                 type: boolean
 *               thirdParty:
 *                 type: boolean
 *               advertise:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 회원가입 성공
 */
router.post("/register", authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - devicePassword
 *     responses:
 *       200:
 *         description: 로그인 성공
 */
router.post("/login", authController.login);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: 토큰 갱신
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 */
router.post("/refresh-token", authController.refreshToken);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: 비밀번호 재설정
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 비밀번호 재설정 성공
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: 비밀번호 변경
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldpassword:
 *                 type: string
 *               newpassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 비밀번호 변경 성공
 */
router.post("/change-password", authController.changePassword);

/**
 * @swagger
 * /api/auth/account:
 *   get:
 *     summary: 계정 정보 조회
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 계정 정보 조회 성공
 */
router.get("/account", auth, authController.getAccount);

/**
 * @swagger
 * /api/auth/balance:
 *   get:
 *     summary: DP Token 잔액 조회
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 잔액 조회 성공
 */
router.get("/balance", auth, authController.getAccountBalance);

/**
 * @swagger
 * /api/auth/social/login-url:
 *   get:
 *     summary: 소셜 로그인 URL 조회
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: callbackUrl
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: URL 생성 성공
 */
router.get("/social/login-url", authController.getSocialLoginUrl);

/**
 * @swagger
 * /api/auth/social/finalize:
 *   post:
 *     summary: 소셜 로그인 완료
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: 소셜 로그인 완료
 */
router.post("/social/finalize", authController.finalizeSocialLogin);

/**
 * @swagger
 * /api/auth/social/register:
 *   post:
 *     summary: 소셜 회원가입
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       200:
 *         description: 소셜 회원가입 성공
 */
router.post("/social/register", authController.socialRegister);

/**
 * @swagger
 * /api/auth/social/login-full:
 *   post:
 *     summary: 소셜 로그인 전체 플로우
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *               callbackUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: 소셜 로그인 성공
 */
router.post("/social/login-full", authController.socialLoginFull);

/**
 * @swagger
 * /api/auth/social/complete-flow:
 *   post:
 *     summary: 소셜 로그인 + MPC 지갑 통합 플로우
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: 통합 플로우 완료
 */
router.post("/social/complete-flow", authController.socialLoginCompleteFlow);

/**
 * @swagger
 * /api/auth/mpc/wallet/create-or-recover:
 *   post:
 *     summary: MPC 지갑 생성/복구
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - devicePassword
 *               - email
 *     responses:
 *       200:
 *         description: 지갑 생성/복구 성공
 */
router.post(
  "/mpc/wallet/create-or-recover",
  authController.createOrRecoverMpcWallet
);

/**
 * @swagger
 * /api/auth/mpc/wallet/validate:
 *   post:
 *     summary: MPC 지갑 데이터 검증
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 검증 성공
 */
router.post("/mpc/wallet/validate", auth, authController.validateMpcWalletData);

/**
 * @swagger
 * /api/auth/mpc/wallet/clear:
 *   post:
 *     summary: MPC 지갑 데이터 삭제
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 삭제 성공
 */
router.post("/mpc/wallet/clear", auth, authController.clearWalletData);

module.exports = router;
