const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/ipController");

// 예시: IP NFT 민팅
router.post("/mint", ipController.mint);

// 예시: IP NFT 정보 조회
router.get("/:tokenId", ipController.getIpNftByTokenId);

module.exports = router;
