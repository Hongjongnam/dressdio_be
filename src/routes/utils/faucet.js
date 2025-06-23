const express = require("express");
const router = express.Router();
const utilController = require("../../controllers/utils/utilController");

// POST /api/utils/faucet
router.post("/", utilController.faucet);

module.exports = router;
