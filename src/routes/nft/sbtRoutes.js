const express = require("express");
const router = express.Router();
const sbtController = require("../../controllers/nft/sbtController");

/**
 * @route GET /api/nft/sbt
 * @desc Get all SBTs from database
 * @access Public
 */
router.get("/", sbtController.getAllSBTs);

/**
 * @route GET /api/nft/sbt/admin/balance
 * @desc Get admin wallet balance
 * @access Public
 */
router.get("/admin/balance", sbtController.getAdminBalance);

/**
 * @route POST /api/nft/sbt/mint
 * @desc Mint a new SBT
 * @access Public
 */
router.post("/mint", sbtController.mintSbt);

/**
 * @route POST /api/nft/sbt/transfer-ownership
 * @desc Transfer SBT contract ownership
 * @access Public
 */
router.post("/transfer-ownership", sbtController.transferSbtOwnership);

/**
 * @route GET /api/nft/sbt/db/:walletAddress
 * @desc Get SBT information from database by wallet address
 * @access Public
 */
router.get("/db/:walletAddress", sbtController.getSBT);

/**
 * @route GET /api/nft/sbt/info/:sbtId
 * @desc Get SBT information by token ID
 * @access Public
 */
router.get("/info/:sbtId", sbtController.getSbtInfo);

/**
 * @route GET /api/nft/sbt/:walletAddress
 * @desc Get SBT information from blockchain by wallet address
 * @access Public
 */
router.get("/:walletAddress", sbtController.getSbtByWalletAddress);

module.exports = router;
