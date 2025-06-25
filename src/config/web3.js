const { Web3 } = require("web3");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("../utils/logger");

// Load ABIs
const sbtContractABI = require("../abi/SbtContract.json");
const IPNFTFactoryABI = require("../abi/IPNFTFactory.json");
const CreatorSBTABI = require("../abi/ICreatorSBT.json");
const DPTokenABI = require("../abi/DPToken.json");
const IPNFTABI = require("../abi/IPNFT.json");
const PlatformRegistryABI = require("../abi/PlatformRegistry.json");
const MerchandiseFactoryABI = require("../abi/MerchandiseFactory.json");

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Create Web3 instance first
const web3 = new Web3(process.env.RPC_URL || "http://3.38.125.193:8545");

// Contract Addresses
const contractAddresses = {
  ipnftFactory: process.env.IPNFT_FACTORY_ADDRESS,
  dpToken: process.env.DP_TOKEN_ADDRESS,
  sbtContract: process.env.SBT_CONTRACT_ADDRESS,
  creatorSBT: process.env.SBT_CONTRACT_ADDRESS, // Use the same SBT contract address
  platformRegistry: process.env.PLATFORM_REGISTRY_ADDRESS,
  merchandiseFactory: process.env.MERCH_FACTORY_ADDRESS,
};

// Log contract addresses for debugging
logger.info("Contract Addresses:", {
  ipnftFactory: contractAddresses.ipnftFactory,
  dpToken: contractAddresses.dpToken,
  sbtContract: contractAddresses.sbtContract,
  creatorSBT: contractAddresses.creatorSBT,
  platformRegistry: contractAddresses.platformRegistry,
  merchandiseFactory: contractAddresses.merchandiseFactory,
});

// Validate contract addresses after web3 is initialized
const validateAddresses = () => {
  Object.entries(contractAddresses).forEach(([name, address]) => {
    if (!address || !web3.utils.isAddress(address)) {
      logger.error(`Invalid or missing ${name} contract address: ${address}`);
      throw new Error(`Invalid or missing ${name} contract address`);
    }
  });
};

// Web3 configuration
const web3Config = {
  chainId: process.env.CHAIN_ID || "1337",
  rpcUrl: process.env.RPC_URL || "http://3.38.125.193:8545",
  adminWallet: {
    address: process.env.PLATFORM_ADMIN_WALLET_ADDRESS,
    privateKey: process.env.DRESSDIO_ADMIN_PRIVATE_KEY,
  },
  platformAdmin: process.env.PLATFORM_ADMIN_WALLET_ADDRESS,
  // ABC Wallet configuration
  abcWalletBaseUrl: process.env.BASEURL,
  devicePassword: process.env.DEVICE_PASSWORD,
};

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

// Create contract instances
const sbtContract = new web3.eth.Contract(
  sbtContractABI,
  contractAddresses.sbtContract
);

const dpTokenContract = new web3.eth.Contract(
  DPTokenABI,
  contractAddresses.dpToken
);

const ipnftFactoryContract = new web3.eth.Contract(
  IPNFTFactoryABI,
  contractAddresses.ipnftFactory
);

const platformRegistryContract = new web3.eth.Contract(
  PlatformRegistryABI,
  contractAddresses.platformRegistry
);

const merchandiseFactoryContract = new web3.eth.Contract(
  MerchandiseFactoryABI,
  contractAddresses.merchandiseFactory
);

// Use the full SbtContract ABI for creatorSBTContract
const creatorSBTContract = new web3.eth.Contract(
  sbtContractABI, // Changed from CreatorSBTABI to sbtContractABI
  contractAddresses.creatorSBT
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
    validateAddresses();
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
  // Contract ABIs
  sbtContractABI,
  IPNFTFactoryABI,
  CreatorSBTABI,
  DPTokenABI,
  IPNFTABI,
  PlatformRegistryABI,
  MerchandiseFactoryABI,
  // Web3 instance
  web3,
  // Contract instances
  sbtContract,
  dpTokenContract,
  ipnftFactoryContract,
  platformRegistryContract,
  creatorSBTContract,
  merchandiseFactoryContract,
  // Contract addresses
  ipnftFactoryAddress: contractAddresses.ipnftFactory,
  dpTokenAddress: contractAddresses.dpToken,
  sbtContractAddress: contractAddresses.sbtContract,
  creatorSBTAddress: contractAddresses.creatorSBT,
  platformRegistryAddress: contractAddresses.platformRegistry,
  merchandiseFactoryAddress: contractAddresses.merchandiseFactory,
  // ABC Wallet config
  abcWalletBaseUrl: web3Config.abcWalletBaseUrl,
  devicePassword: web3Config.devicePassword,
  // Admin account
  dressdioAdminAccount,
  // Web3 config
  web3Config,
  // Functions
  checkConnection,
  initializeWeb3,
};
