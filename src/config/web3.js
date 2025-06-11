const { Web3 } = require("web3");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("../utils/logger");
const sbtContractABI = require("../abi/SbtContract.json");

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Web3 configuration
const web3Config = {
  chainId: process.env.CHAIN_ID || "1337",
  rpcUrl: process.env.RPC_URL || "http://3.38.125.193:8545",
  adminWallet: {
    address: process.env.DRESSDIO_ADMIN_WALLET_ADDRESS,
    privateKey: process.env.DRESSDIO_ADMIN_PRIVATE_KEY,
  },
  platformAdmin: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
  sbtContractAddress: process.env.SBT_CONTRACT_ADDRESS,
};

// Validate required environment variables
const validateConfig = () => {
  const required = [
    "DRESSDIO_ADMIN_WALLET_ADDRESS",
    "DRESSDIO_ADMIN_PRIVATE_KEY",
    "SBT_CONTRACT_ADDRESS",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
};

// Create Web3 instance
const web3 = new Web3(web3Config.rpcUrl);

// Format and validate admin account
const dressdioAdminAccount = {
  address: web3Config.adminWallet.address,
  privateKey: web3Config.adminWallet.privateKey.startsWith("0x")
    ? web3Config.adminWallet.privateKey
    : `0x${web3Config.adminWallet.privateKey}`,
};

// Add admin account to wallet
const initializeAdminAccount = () => {
  try {
    if (!dressdioAdminAccount.privateKey) {
      throw new Error("Admin private key is not configured");
    }
    web3.eth.accounts.wallet.add(dressdioAdminAccount.privateKey);
    logger.info("Admin account added to wallet");
  } catch (error) {
    logger.error("Failed to initialize admin account:", error);
    throw error;
  }
};

// Create contract instance
const sbtContract = new web3.eth.Contract(
  sbtContractABI,
  web3Config.sbtContractAddress
);

// Check network connection
const checkConnection = async () => {
  try {
    const networkId = Number(await web3.eth.net.getId());
    if (networkId !== Number(web3Config.chainId)) {
      throw new Error(
        `Network mismatch: Expected chain ID ${web3Config.chainId}, but got ${networkId}`
      );
    }
    logger.info("Web3 connection successful");
    return true;
  } catch (error) {
    logger.error("Web3 connection failed:", error);
    return false;
  }
};

// Initialize Web3
const initializeWeb3 = async () => {
  try {
    validateConfig();
    initializeAdminAccount();
    await checkConnection();
  } catch (error) {
    logger.error("Web3 initialization failed:", error);
    throw error;
  }
};

// Initialize if this file is run directly
if (require.main === module) {
  initializeWeb3()
    .then(() => {
      logger.info("Web3 initialization completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Web3 initialization failed:", error);
      process.exit(1);
    });
}

module.exports = {
  web3,
  dressdioAdminAccount,
  PLATFORM_ADMIN_WALLET_ADDRESS: web3Config.platformAdmin,
  sbtContract,
  checkConnection,
  initializeWeb3,
};
