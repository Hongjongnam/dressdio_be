const express = require("express");
const router = express.Router();

// Import NFT type routes
const sbtRoutes = require("./sbtRoutes");
const ipRoutes = require("./ipRoutes");
const platformRoutes = require("./platformRoutes");
const merchandiseRoutes = require("./merchandiseRoutes");

/**
 * @route /api/nft/sbt
 * @desc SBT (Soulbound Token) related routes
 */
router.use("/sbt", sbtRoutes);

/**
 * @route /api/nft/ip
 * @desc IP (In-Game Item) related routes
 */
router.use("/ip", ipRoutes);

/**
 * @route /api/nft/platform
 * @desc PlatformRegistry management routes
 */
router.use("/platform", platformRoutes);

/**
 * @route /api/nft/merchandise
 * @desc Merchandise project related routes
 */
router.use("/merchandise", merchandiseRoutes);

module.exports = router;
