const express = require("express");
const router = express.Router();

// Import NFT type routes
const sbtRoutes = require("./sbtRoutes");

// Mount NFT type routes
router.use("/sbt", sbtRoutes);

// TODO: Add other NFT type routes (IP, Merchandise, etc.)
// router.use('/ip', ipRoutes);
// router.use('/merchandise', merchandiseRoutes);

module.exports = router;
