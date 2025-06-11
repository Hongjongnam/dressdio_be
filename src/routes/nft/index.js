const express = require("express");
const router = express.Router();

// Import NFT type routes
const sbtRoutes = require("./sbtRoutes");

/**
 * @route /api/nft/sbt
 * @desc SBT (Soulbound Token) related routes
 */
router.use("/sbt", sbtRoutes);

module.exports = router;
