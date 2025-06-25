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

module.exports = router;
