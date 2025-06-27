const express = require("express");
const router = express.Router();
const platformController = require("../../controllers/nft/platformController");
const auth = require("../../middleware/auth");

// PlatformRegistry 관련 라우트
router.post("/transfer-ownership", auth, platformController.transferOwnership);
router.get("/owner", platformController.getOwner);
router.get("/status", platformController.getStatus);
router.post("/set-factory", auth, platformController.setFactory);
router.get("/addresses", platformController.getAddresses);

// 통합 소유권 이전
router.post(
  "/transfer-all-ownership",
  auth,
  platformController.transferAllOwnership
);

module.exports = router;
