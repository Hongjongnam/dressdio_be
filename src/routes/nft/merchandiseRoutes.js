const express = require("express");
const router = express.Router();
const merchandiseController = require("../../controllers/nft/merchandiseController");
const auth = require("../../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/nft/merchandise/create - 상품 프로젝트 생성
router.post("/create", auth, upload.any(), merchandiseController.createProject);

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

// POST /api/nft/merchandise/activate/:projectId - 프로젝트 활성화 (브랜드만)
router.post("/activate/:projectId", auth, merchandiseController.setActive);

// GET /api/nft/merchandise/brand-pending - 브랜드가 서명(활성화)해야 하는 프로젝트만 조회
router.get(
  "/brand-pending",
  auth,
  merchandiseController.getBrandPendingProjects
);

module.exports = router;
