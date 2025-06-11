const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/IpController");

/**
 * @route POST /api/nft/ip/mint
 * @desc Mint a new IP NFT
 * @access Public
 */
router.post("/mint", ipController.mintIPNFT);

/**
 * @route GET /api/nft/ip
 * @desc Get all IP NFTs
 * @access Public
 */
router.get("/", ipController.getAllIPNFTs);

/**
 * @route GET /api/nft/ip/:tokenId
 * @desc Get IP NFT information by token ID
 * @access Public
 */
router.get("/:tokenId", ipController.getIPNFT);

/**
 * @route GET /api/nft/ip/sbt/:sbtTokenId
 * @desc Get all IP NFTs by SBT token ID
 * @access Public
 */
router.get("/sbt/:sbtTokenId", ipController.getIPNFTsBySBTTokenId);

module.exports = router;
