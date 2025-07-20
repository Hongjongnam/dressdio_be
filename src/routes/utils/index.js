const express = require("express");
const router = express.Router();
const utilController = require("../../controllers/utils/utilController");
const authMiddleware = require("../../middleware/auth");
const { upload } = require("../../services/upload"); // upload 객체를 직접 import

// DP Faucet route (테스트용이므로 인증 없음)
router.post("/faucet", utilController.faucet);

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
