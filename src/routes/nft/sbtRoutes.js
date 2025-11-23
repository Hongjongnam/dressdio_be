const express = require("express");
const router = express.Router();
const sbtController = require("../../controllers/nft/sbtController");
const auth = require("../../middleware/auth");

/**
 * @swagger
 * /api/nft/sbt/list:
 *   get:
 *     summary: 전체 SBT 목록 조회
 *     tags: [SBT]
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get("/list", sbtController.getAllSBTs);

/**
 * @swagger
 * /api/nft/sbt/admin/balance:
 *   get:
 *     summary: 관리자 지갑 잔액 조회
 *     tags: [SBT]
 *     responses:
 *       200:
 *         description: 잔액 조회 성공
 */
router.get("/admin/balance", sbtController.getAdminBalance);

/**
 * @swagger
 * /api/nft/sbt/mint:
 *   post:
 *     summary: SBT 발행
 *     tags: [SBT]
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
 *               - storedWalletData
 *               - creatorWalletAddress
 *               - creatorType
 *               - creatorName
 *               - description
 *     responses:
 *       200:
 *         description: SBT 발행 성공
 */
router.post("/mint", auth, sbtController.mintSbt);

/**
 * @swagger
 * /api/nft/sbt/transfer-ownership:
 *   post:
 *     summary: SBT 소유권 이전
 *     tags: [SBT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newOwner
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 소유권 이전 성공
 */
router.post("/transfer-ownership", auth, sbtController.transferSbtOwnership);

/**
 * @swagger
 * /api/nft/sbt/info/{sbtId}:
 *   get:
 *     summary: SBT 정보 조회
 *     tags: [SBT]
 *     parameters:
 *       - in: path
 *         name: sbtId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 정보 조회 성공
 */
router.get("/info/:sbtId", sbtController.getSbtInfo);

module.exports = router;
