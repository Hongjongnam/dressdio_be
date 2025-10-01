const express = require("express");
const router = express.Router();
const utilController = require("../../controllers/utils/utilController");
const authMiddleware = require("../../middleware/auth");
const { upload } = require("../../services/upload"); // upload 객체를 직접 import

// DP Faucet route (테스트용이므로 인증 없음)
router.post("/faucet", utilController.faucet);

// Dress → DP Token Swap (1:5 비율)
router.post("/swap-dress-to-dp", utilController.swapDressToDp);

// Dress Token 잔액 조회 (Polygon)
router.get(
  "/dress-token/balance",
  authMiddleware,
  utilController.getDressTokenBalance
);

// DP Token 전송 (Besu, MPC 패턴)
router.post(
  "/dp-token/transfer",
  authMiddleware,
  utilController.transferDPToken
);

// Dress Token 전송 (Polygon, MPC 패턴)
router.post(
  "/dress-token/transfer",
  authMiddleware,
  utilController.transferDressToken
);

// Dress Token 전송 + DP Token 자동 스왑 통합 API (플랫폼 전용)
router.post(
  "/dress-token/transfer-and-swap",
  authMiddleware,
  utilController.transferDressTokenAndSwap
);

// File upload to IPFS (테스트용이므로 인증 없음)
router.post(
  "/ipfs/upload-file",
  upload.single("file"), // upload.single() 사용
  utilController.uploadFileToIPFS
);

// JSON upload to IPFS (테스트용이므로 인증 없음)
router.post("/ipfs/upload-json", utilController.uploadJSONToIPFS);

// Debugging route for IPNFT state
router.get(
  "/debug/ipnft/:tokenId",
  authMiddleware,
  utilController.debugIpNftState
);

module.exports = router;
