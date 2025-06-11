const express = require("express");
const router = express.Router();

// Import NFT type routes
const sbtRoutes = require("./sbtRoutes");
const ipRoutes = require("./ipRoutes");

/**
 * @route /api/nft/sbt
 * @desc SBT (Soulbound Token) related routes
 */
router.use("/sbt", sbtRoutes);

/**
 * @route /api/nft/ip
 * @desc IP NFT related routes
 */
router.use("/ip", ipRoutes);

// TODO: Add other NFT type routes (Merchandise, etc.)
// router.use('/merchandise', merchandiseRoutes);

module.exports = router;
