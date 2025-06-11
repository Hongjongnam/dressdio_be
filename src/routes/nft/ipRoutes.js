const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/ipController");

/**
 * @route GET /api/nft/ip
 * @desc Get all IP NFTs from database
 * @access Public
 */
router.get("/", ipController.getAllIPs);

/**
 * @route GET /api/nft/ip/:walletAddress
 * @desc Get IP NFT information from blockchain by wallet address
 * @access Public
 */
router.get("/:walletAddress", ipController.getIPByWalletAddress);

/**
 * @route GET /api/nft/ip/db/:walletAddress
 * @desc Get IP NFT information from database by wallet address
 * @access Public
 */
router.get("/db/:walletAddress", ipController.getIP);

/**
 * @route POST /api/nft/ip/mint
 * @desc Mint a new IP NFT
 * @access Public
 */
router.post("/mint", ipController.mintIP);

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
