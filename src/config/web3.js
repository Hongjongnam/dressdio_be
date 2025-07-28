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
const web3 = new Web3(process.env.RPC_URL || "https://besu.dressdio.me");

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
  chainId: process.env.CHAIN_ID || "2741",
  rpcUrl: process.env.RPC_URL || "https://besu.dressdio.me",
  adminWallet: {
    address: process.env.PLATFORM_ADMIN_WALLET_ADDRESS,
    privateKey: process.env.DRESSDIO_ADMIN_PRIVATE_KEY,
  },
  platformAdmin: process.env.PLATFORM_ADMIN_WALLET_ADDRESS,
  // ABC Wallet configuration
  abcWalletBaseUrl: process.env.BASEURL,
  // devicePassword is now provided by user input, not environment variable
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

let ipnftContract; // 내부에서 관리할 변수

const getIpNftContract = () => {
  if (!ipnftContract) {
    throw new Error(
      "IPNFT Contract is not initialized yet. Ensure initializeWeb3() has been called and completed."
    );
  }
  return ipnftContract;
};

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

    const ipnftAddress = await ipnftFactoryContract.methods
      .getIPNFTAddress()
      .call();
    if (ipnftAddress && web3.utils.isAddress(ipnftAddress)) {
      ipnftContract = new web3.eth.Contract(IPNFTABI, ipnftAddress);
      logger.info(`IPNFT contract instance created at: ${ipnftAddress}`);
    } else {
      throw new Error(
        "Failed to retrieve a valid IPNFT contract address from the factory."
      );
    }
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
  // ipnftContract는 initializeWeb3에서 동적으로 추가됩니다.
  // Contract addresses
  ipnftFactoryAddress: contractAddresses.ipnftFactory,
  dpTokenAddress: contractAddresses.dpToken,
  sbtContractAddress: contractAddresses.sbtContract,
  creatorSBTAddress: contractAddresses.creatorSBT,
  platformRegistryAddress: contractAddresses.platformRegistry,
  merchandiseFactoryAddress: contractAddresses.merchandiseFactory,
  // ABC Wallet config
  abcWalletBaseUrl: web3Config.abcWalletBaseUrl,
  // devicePassword is now provided by user input, not config
  // Admin account
  dressdioAdminAccount,
  // Web3 config
  web3Config,
  // Functions
  checkConnection,
  initializeWeb3,
  getIpNftContract, // Getter 함수를 내보냄
};
