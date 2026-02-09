const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/auth");
const personalController = require("../../controllers/nft/personalController");

// ==========================================
// 구매 플로우
// ==========================================

/**
 * @route POST /api/nft/personal/request-purchase
 * @desc 구매 요청 (KRW 에스크로)
 * @access Private
 */
router.post(
  "/request-purchase",
  authMiddleware,
  personalController.requestPurchase
);

/**
 * @route POST /api/nft/personal/confirm-purchase
 * @desc 구매 확정 (NFT 발행 + 수익 분배)
 * @access Private
 */
router.post(
  "/confirm-purchase",
  authMiddleware,
  personalController.confirmPurchase
);

/**
 * @route POST /api/nft/personal/cancel-purchase
 * @desc 구매 취소 (환불 - 플랫폼 수수료)
 * @access Private
 */
router.post(
  "/cancel-purchase",
  authMiddleware,
  personalController.cancelPurchase
);

// ==========================================
// 조회 API
// ==========================================

/**
 * @route GET /api/nft/personal/my-requests
 * @desc 내 구매 요청 목록 조회
 * @access Private
 */
router.get(
  "/my-requests",
  authMiddleware,
  personalController.getMyPurchaseRequests
);

/**
 * @route GET /api/nft/personal/request/:requestId
 * @desc 구매 요청 상세 조회
 * @access Public
 */
router.get("/request/:requestId", personalController.getPurchaseRequest);

/**
 * @route GET /api/nft/personal/my
 * @desc 내 Personal NFT 목록 조회
 * @access Private
 */
router.get("/my", authMiddleware, personalController.getMyPersonalNFTs);

/**
 * @route POST /api/nft/personal/calculate-price
 * @desc 가격 미리 계산
 * @access Public
 */
router.post("/calculate-price", personalController.calculatePrice);

/**
 * @route GET /api/nft/personal/distribution/:txHash
 * @desc TxHash로 정산 내역 조회
 * @access Public
 */
router.get("/distribution/:txHash", personalController.getDistributionByTxHash);

/**
 * @route GET /api/nft/personal/platform-fee
 * @desc 플랫폼 수수료 조회
 * @access Public
 */
router.get("/platform-fee", personalController.getPlatformFee);

/**
 * @route POST /api/nft/personal/platform-fee
 * @desc 플랫폼 수수료 설정 (관리자 전용)
 * @access Private
 */
router.post("/platform-fee", authMiddleware, personalController.setPlatformFee);

/**
 * @route GET /api/nft/personal/:tokenId
 * @desc Personal NFT 상세 조회
 * @access Public
 * @important 이 라우트는 반드시 마지막에 위치해야 함 (파라미터 라우트이므로)
 */
router.get("/:tokenId", personalController.getPersonalNFTInfo);

module.exports = router;
