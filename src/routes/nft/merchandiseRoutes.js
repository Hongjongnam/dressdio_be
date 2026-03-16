const express = require("express");
const router = express.Router();
const merchandiseController = require("../../controllers/nft/merchandiseController");
const auth = require("../../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/nft/merchandise/create:
 *   post:
 *     summary: Merchandise 프로젝트 생성
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectName
 *               - description
 *               - quantity
 *               - salePrice
 *               - ipnftTokenIds
 *               - devicePassword
 *               - storedWalletData
 *             properties:
 *               projectName:
 *                 type: string
 *               description:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               salePrice:
 *                 type: string
 *               ipnftTokenIds:
 *                 type: string
 *                 example: "0,1,2"
 *               projectImageUrl:
 *                 type: string
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *     responses:
 *       200:
 *         description: 프로젝트 생성 성공
 */
router.post("/create", auth, merchandiseController.createProject);

/**
 * @swagger
 * /api/nft/merchandise/my:
 *   get:
 *     summary: 내 Merchandise 프로젝트 목록
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get("/my", auth, merchandiseController.getMyProjects);

/**
 * @swagger
 * /api/nft/merchandise/list:
 *   get:
 *     summary: 전체 Merchandise 프로젝트 목록
 *     tags: [Merchandise]
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get("/list", merchandiseController.getAllProjects);

/**
 * @swagger
 * /api/nft/merchandise/request-purchase:
 *   post:
 *     summary: Merchandise 구매 요청
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - devicePassword
 *               - storedWalletData
 *             properties:
 *               projectId:
 *                 type: integer
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *     responses:
 *       200:
 *         description: 구매 요청 성공
 */
router.post("/request-purchase", auth, merchandiseController.requestPurchase);

/**
 * @swagger
 * /api/nft/merchandise/confirm-purchase:
 *   post:
 *     summary: Merchandise 구매 확정
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - requestId
 *               - tokenURI
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 구매 확정 성공
 */
router.post("/confirm-purchase", auth, merchandiseController.confirmPurchase);

/**
 * @swagger
 * /api/nft/merchandise/cancel-purchase:
 *   post:
 *     summary: Merchandise 구매 취소
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - requestId
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 구매 취소 성공
 */
router.post("/cancel-purchase", auth, merchandiseController.cancelPurchase);

/**
 * @swagger
 * /api/nft/merchandise/purchase-request/{projectId}/{requestId}:
 *   get:
 *     summary: 특정 구매 요청 정보 조회
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get(
  "/purchase-request/:projectId/:requestId",
  merchandiseController.getPurchaseRequest
);

/**
 * @swagger
 * /api/nft/merchandise/purchase-requests/{projectId}:
 *   get:
 *     summary: 프로젝트별 구매 요청 목록
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get(
  "/purchase-requests/:projectId",
  merchandiseController.getProjectPurchaseRequests
);

/**
 * @swagger
 * /api/nft/merchandise/my-purchase-requests:
 *   get:
 *     summary: 내 구매 요청 목록
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get(
  "/my-purchase-requests",
  auth,
  merchandiseController.getMyPurchaseRequests
);

/**
 * @swagger
 * /api/nft/merchandise/platform-fee-info:
 *   get:
 *     summary: 플랫폼 수수료 정보 조회
 *     tags: [Merchandise]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/platform-fee-info", merchandiseController.getPlatformFeeInfo);

/**
 * @swagger
 * /api/nft/merchandise/platform-fee-info:
 *   post:
 *     summary: 역할별 플랫폼 수수료 설정 (관리자 전용)
 *     tags: [Merchandise]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, feePercentage, storedWalletData, devicePassword]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [brand, artist, influencer, cancel]
 *               feePercentage:
 *                 type: integer
 *                 description: basis points (100 = 1%, 최대 1000 = 10%)
 *     responses:
 *       200:
 *         description: 수수료 설정 성공
 */
router.post("/platform-fee-info", auth, merchandiseController.setPlatformFeeInfo);

// 크리에이터별 개별 수수료 관리
router.get("/creator-fee", merchandiseController.getCreatorFee);
router.post("/creator-fee", auth, merchandiseController.setCreatorFee);
router.delete("/creator-fee", auth, merchandiseController.removeCreatorFee);

/**
 * @swagger
 * /api/nft/merchandise/activate:
 *   post:
 *     summary: Merchandise 프로젝트 활성화
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - devicePassword
 *               - storedWalletData
 *     responses:
 *       200:
 *         description: 활성화 성공
 */
router.post("/activate", auth, merchandiseController.setActive);

/**
 * @swagger
 * /api/nft/merchandise/brand-pending:
 *   get:
 *     summary: 브랜드 활성화 대기 프로젝트
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get(
  "/brand-pending",
  auth,
  merchandiseController.getBrandPendingProjects
);

/**
 * @swagger
 * /api/nft/merchandise/my-nfts:
 *   get:
 *     summary: 내가 소유한 Merchandise NFT 목록
 *     tags: [Merchandise]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/my-nfts", auth, merchandiseController.getMyMerchandiseNFTs);

/**
 * @swagger
 * /api/nft/merchandise/all-nfts:
 *   get:
 *     summary: 전체 Merchandise NFT 목록
 *     tags: [Merchandise]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/all-nfts", merchandiseController.getAllMerchandiseNFTs);

/**
 * @swagger
 * /api/nft/merchandise/nft/{tokenId}:
 *   get:
 *     summary: 특정 Merchandise NFT 정보 조회
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/nft/:tokenId", merchandiseController.getMerchandiseNFTInfo);

/**
 * @swagger
 * /api/nft/merchandise/receipts:
 *   get:
 *     summary: Merchandise 영수증 전체 목록
 *     tags: [Merchandise]
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/receipts", merchandiseController.getAllReceipts);

/**
 * @swagger
 * /api/nft/merchandise/receipt/{receiptId}:
 *   get:
 *     summary: 특정 Merchandise 영수증 조회
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: receiptId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get("/receipt/:receiptId", merchandiseController.getReceiptById);

/**
 * @swagger
 * /api/nft/merchandise/receipts/project/{projectId}:
 *   get:
 *     summary: 프로젝트별 Merchandise 영수증 목록
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 조회 성공
 */
router.get(
  "/receipts/project/:projectId",
  merchandiseController.getReceiptsByProject
);

/**
 * @swagger
 * /api/nft/merchandise/receipt/{receiptId}/pdf:
 *   get:
 *     summary: Merchandise 영수증 PDF 다운로드
 *     tags: [Merchandise]
 *     parameters:
 *       - in: path
 *         name: receiptId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF 생성 성공
 */
router.get("/receipt/:receiptId/pdf", merchandiseController.generatePDFReceipt);

module.exports = router;
