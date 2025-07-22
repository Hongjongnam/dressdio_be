const express = require("express");
const router = express.Router();
const merchandiseController = require("../../controllers/nft/merchandiseController");
const auth = require("../../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/nft/merchandise/create - 상품 프로젝트 생성
router.post("/create", auth, merchandiseController.createProject);

// GET /api/nft/merchandise/my - 인플루언서 자신의 프로젝트 목록 조회 (auth 미들웨어 사용)
router.get("/my", auth, merchandiseController.getMyProjects);

// GET /api/nft/merchandise/list - 전체 프로젝트 목록 조회
router.get("/list", merchandiseController.getAllProjects);

// POST /api/nft/merchandise/request-purchase - 구매 요청 (사용자가 DP로 구매 신청)
router.post("/request-purchase", auth, merchandiseController.requestPurchase);

// POST /api/nft/merchandise/confirm-purchase - 구매 확정 (인플루언서가 확정)
router.post("/confirm-purchase", auth, merchandiseController.confirmPurchase);

// POST /api/nft/merchandise/cancel-purchase - 구매 취소 (구매자 또는 인플루언서가 취소)
router.post("/cancel-purchase", auth, merchandiseController.cancelPurchase);

// GET /api/nft/merchandise/purchase-request/:projectId/:requestId - 구매 요청 정보 조회
router.get(
  "/purchase-request/:projectId/:requestId",
  merchandiseController.getPurchaseRequest
);

// GET /api/nft/merchandise/purchase-requests/:projectId - 프로젝트별 구매 요청 목록 조회
router.get(
  "/purchase-requests/:projectId",
  merchandiseController.getProjectPurchaseRequests
);

// GET /api/nft/merchandise/my-purchase-requests - 구매자별 구매 요청 목록 조회
router.get(
  "/my-purchase-requests",
  auth,
  merchandiseController.getMyPurchaseRequests
);

// GET /api/nft/merchandise/platform-fee-info - 플랫폼 수수료 정보 조회
router.get("/platform-fee-info", merchandiseController.getPlatformFeeInfo);

// POST /api/nft/merchandise/activate - 프로젝트 활성화 (브랜드만)
router.post("/activate", auth, merchandiseController.setActive);

// GET /api/nft/merchandise/brand-pending - 브랜드가 서명(활성화)해야 하는 프로젝트만 조회
router.get(
  "/brand-pending",
  auth,
  merchandiseController.getBrandPendingProjects
);

// GET /api/nft/merchandise/my-nfts - 내가 소유한 Merchandise NFT 목록 조회
router.get("/my-nfts", auth, merchandiseController.getMyMerchandiseNFTs);

// GET /api/nft/merchandise/all-nfts - 전체 Merchandise NFT 목록 조회 (관리자용)
router.get("/all-nfts", merchandiseController.getAllMerchandiseNFTs);

// GET /api/nft/merchandise/nft/:tokenId - 특정 Merchandise NFT 정보 조회
router.get("/nft/:tokenId", merchandiseController.getMerchandiseNFTInfo);

// 영수증 관련 라우트
// GET /api/nft/merchandise/receipts - 모든 영수증 목록 조회
router.get("/receipts", merchandiseController.getAllReceipts);

// GET /api/nft/merchandise/receipt/:receiptId - 특정 영수증 조회
router.get("/receipt/:receiptId", merchandiseController.getReceiptById);

// GET /api/nft/merchandise/receipts/project/:projectId - 프로젝트별 영수증 목록 조회
router.get(
  "/receipts/project/:projectId",
  merchandiseController.getReceiptsByProject
);

// PDF 영수증 관련 라우트
// GET /api/nft/merchandise/receipt/:receiptId/pdf - PDF 영수증 다운로드
router.get("/receipt/:receiptId/pdf", merchandiseController.generatePDFReceipt);

module.exports = router;
