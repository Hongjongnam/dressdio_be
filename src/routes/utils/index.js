const express = require("express");
const router = express.Router();
const utilController = require("../../controllers/utils/utilController");
const authMiddleware = require("../../middleware/auth");
const { upload } = require("../../services/upload"); // upload 객체를 직접 import

/**
 * @swagger
 * /api/utils/faucet:
 *   post:
 *     summary: Faucet (DP 토큰 받기)
 *     tags: [Utils]
 *     description: 테스트용 DP Token 에어드랍 기능입니다. 인증이 필요 없습니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *               - amount
 *             properties:
 *               walletAddress:
 *                 type: string
 *               amount:
 *                 type: string
 *     responses:
 *       200:
 *         description: 에어드랍 성공
 */
router.post("/faucet", utilController.faucet);

/**
 * @swagger
 * /api/utils/swap-dress-to-dp:
 *   post:
 *     summary: Dress → DP 수동 스왑
 *     tags: [Utils]
 *     description: 플랫폼 어드민이 수동으로 Dress Token TxHash를 검증해 DP Token을 지급
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHash
 *               - fromAddress
 *             properties:
 *               txHash:
 *                 type: string
 *               fromAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: 스왑 성공
 */
router.post("/swap-dress-to-dp", utilController.swapDressToDp);

/**
 * @swagger
 * /api/utils/dress-token/balance:
 *   get:
 *     summary: Dress Token 잔액 조회 (Polygon)
 *     tags: [Utils]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: walletAddress
 *         schema:
 *           type: string
 *         description: 조회할 지갑 주소 (없으면 인증된 사용자 기준)
 *     responses:
 *       200:
 *         description: 잔액 조회 성공
 */
router.get(
  "/dress-token/balance",
  authMiddleware,
  utilController.getDressTokenBalance
);

/**
 * @swagger
 * /api/utils/dp-token/transfer:
 *   post:
 *     summary: DP Token 전송 (Besu, MPC)
 *     tags: [Utils]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - amount
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 전송 성공
 */
router.post(
  "/dp-token/transfer",
  authMiddleware,
  utilController.transferDPToken
);

/**
 * @swagger
 * /api/utils/dress-token/transfer:
 *   post:
 *     summary: Dress Token 전송 (Polygon, MPC)
 *     tags: [Utils]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - amount
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 전송 성공
 */
router.post(
  "/dress-token/transfer",
  authMiddleware,
  utilController.transferDressToken
);

/**
 * @swagger
 * /api/utils/dress-token/transfer-and-swap:
 *   post:
 *     summary: Dress Token 전송 + 자동 DP 스왑 (플랫폼)
 *     tags: [Utils]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 전송 및 스왑 성공
 */
router.post(
  "/dress-token/transfer-and-swap",
  authMiddleware,
  utilController.transferDressTokenAndSwap
);

/**
 * @swagger
 * /api/utils/ipfs/upload-file:
 *   post:
 *     summary: IPFS 파일 업로드
 *     tags: [Utils]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 업로드 성공
 */
router.post(
  "/ipfs/upload-file",
  upload.single("file"), // upload.single() 사용
  utilController.uploadFileToIPFS
);

/**
 * @swagger
 * /api/utils/ipfs/upload-json:
 *   post:
 *     summary: IPFS JSON 업로드
 *     tags: [Utils]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jsonData
 *             properties:
 *               jsonData:
 *                 type: object
 *     responses:
 *       200:
 *         description: 업로드 성공
 */
router.post("/ipfs/upload-json", utilController.uploadJSONToIPFS);

/**
 * @swagger
 * /api/utils/debug/ipnft/{tokenId}:
 *   get:
 *     summary: IPNFT 상태 디버그
 *     tags: [Utils]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 디버그 정보
 */
router.get(
  "/debug/ipnft/:tokenId",
  authMiddleware,
  utilController.debugIpNftState
);

/**
 * @swagger
 * /api/utils/tps-test:
 *   post:
 *     summary: 블록체인 조회 TPS 성능 테스트 (eth_blockNumber)
 *     tags: [Utils]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetTps:
 *                 type: integer
 *               durationSeconds:
 *                 type: integer
 *               rpcUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               rpcWeights:
 *                 description: rpcUrls와 동일 길이. 비율만 의미 (예 전부 1이면 균등 분배)
 *                 type: array
 *                 items:
 *                   type: number
 */
router.post("/tps-test", utilController.runTpsTest);

/**
 * @swagger
 * /api/utils/tps-test/pdf:
 *   post:
 *     summary: TPS 테스트 결과 PDF 다운로드
 *     tags: [Utils]
 */
router.post("/tps-test/pdf", utilController.downloadTpsReport);

module.exports = router;
