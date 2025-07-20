const express = require("express");
const router = express.Router();
const sbtController = require("../../controllers/nft/sbtController");
const auth = require("../../middleware/auth");

/**
 * @route GET /api/nft/sbt/list
 * @desc Get all SBTs from database
 * @access Public
 */
router.get("/list", sbtController.getAllSBTs);

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
router.post("/mint", auth, sbtController.mintSbt);

/**
 * @route POST /api/nft/sbt/transfer-ownership
 * @desc Transfer SBT contract ownership
 * @access Protected
 */
router.post("/transfer-ownership", auth, sbtController.transferSbtOwnership);

/**
 * @route GET /api/nft/sbt/info/:sbtId
 * @desc Get SBT information by token ID
 * @access Public
 */
router.get("/info/:sbtId", sbtController.getSbtInfo);

module.exports = router;
