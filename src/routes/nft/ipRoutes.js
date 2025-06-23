const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/ipController");
const auth = require("../../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

module.exports = router;

// POST /api/nft/ip/mint
router.post("/mint", auth, upload.single("file"), ipController.mint);

// GET /api/nft/ip/list - 모든 IPNFT 조회 (public)
router.get("/list", ipController.list);

// GET /api/nft/ip/my - 내가 소유한 IPNFT 조회 (authenticated)
router.get("/my", auth, ipController.getMyIPNFTs);
