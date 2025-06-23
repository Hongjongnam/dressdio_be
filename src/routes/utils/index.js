const express = require("express");
const router = express.Router();

const faucetRouter = require("./faucet");

router.use("/faucet", faucetRouter);

module.exports = router;
