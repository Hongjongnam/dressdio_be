const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const faucetRouter = require("./faucet");
const utilController = require("../../controllers/utils/utilController");

router.use("/faucet", faucetRouter);

// IPFS 업로드 라우트
router.post("/ipfs/upload-file", upload.any(), utilController.uploadFileToIPFS);
router.post("/ipfs/upload-json", utilController.uploadJSONToIPFS);

module.exports = router;
