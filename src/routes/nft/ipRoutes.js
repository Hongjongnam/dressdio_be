const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/ipController");
const auth = require("../../middleware/auth");
const { upload } = require("../../services/upload"); // upload.js에서 가져오도록 수정

// POST /api/nft/ip/mint - IPNFT 발행
router.post("/mint", auth, ipController.mintIpNft);

// GET /api/nft/ip/list - 전체 IPNFT 목록 조회
router.get("/list", ipController.getAllIpNfts);

// GET /api/nft/ip/my - 내가 소유한 IPNFT 목록 조회 (다시 GET으로 변경)
router.get("/my", auth, ipController.getMyIpNfts);

// GET /api/nft/ip/info/:tokenId - 특정 IPNFT 정보 조회
router.get("/info/:tokenId", ipController.getIpNftInfo);

// GET /api/nft/ip/minting-fee - 현재 민팅 수수료 조회
router.get("/minting-fee", ipController.getMintingFee);

// POST /api/nft/ip/set-minting-fee - 민팅 수수료 변경
router.post("/set-minting-fee", auth, ipController.setMintingFee);

// POST /api/nft/ip/upload-image - 이미지 업로드 후 IPFS URI 반환
router.post(
  "/upload-image",
  auth,
  upload.single("image"),
  ipController.uploadImage
);

module.exports = router;
