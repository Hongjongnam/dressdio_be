const express = require("express");
const router = express.Router();
const sbtController = require("../../controllers/nft/sbtController");

// SBT 정보 조회
router.get("/:walletAddress", sbtController.getSbtByWalletAddress);

// SBT 발행
router.post("/mint", sbtController.mintSbt);

// 관리자 지갑 잔액 조회
router.get("/admin/balance", sbtController.getAdminBalance);

module.exports = router;
