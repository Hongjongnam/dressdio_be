const express = require("express");
const router = express.Router();
const platformController = require("../../controllers/nft/platformController");
const auth = require("../../middleware/auth");

/**
 * @swagger
 * /api/nft/platform/transfer-ownership:
 *   post:
 *     summary: PlatformRegistry 소유권 이전
 *     tags: [Platform]
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
 *             properties:
 *               newOwner:
 *                 type: string
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *     responses:
 *       200:
 *         description: 소유권 이전 성공
 */
router.post("/transfer-ownership", auth, platformController.transferOwnership);

/**
 * @swagger
 * /api/nft/platform/owner:
 *   get:
 *     summary: PlatformRegistry 소유자 조회
 *     tags: [Platform]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/owner", platformController.getOwner);

/**
 * @swagger
 * /api/nft/platform/status:
 *   get:
 *     summary: PlatformRegistry 상태 조회
 *     tags: [Platform]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/status", platformController.getStatus);

/**
 * @swagger
 * /api/nft/platform/set-factory:
 *   post:
 *     summary: Factory 주소 설정
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - factoryType
 *               - factoryAddress
 *               - devicePassword
 *               - storedWalletData
 *             properties:
 *               factoryType:
 *                 type: string
 *                 example: merchandise
 *               factoryAddress:
 *                 type: string
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *     responses:
 *       200:
 *         description: 설정 성공
 */
router.post("/set-factory", auth, platformController.setFactory);

/**
 * @swagger
 * /api/nft/platform/addresses:
 *   get:
 *     summary: 등록된 컨트랙트 주소 조회
 *     tags: [Platform]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/addresses", platformController.getAddresses);

/**
 * @swagger
 * /api/nft/platform/transfer-all-ownership:
 *   post:
 *     summary: 통합 소유권 이전
 *     tags: [Platform]
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
 *             properties:
 *               newOwner:
 *                 type: string
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *     responses:
 *       200:
 *         description: 통합 소유권 이전 성공
 */
router.post(
  "/transfer-all-ownership",
  auth,
  platformController.transferAllOwnership
);

module.exports = router;
