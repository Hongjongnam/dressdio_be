const Web3 = require("web3");
const {
  web3,
  platformRegistryContract,
  platformRegistryAddress,
  creatorSBTAddress,
  sbtContractAddress,
  ipnftFactoryAddress,
  dpTokenAddress,
  web3Config,
  ipnftFactoryContract,
} = require("../../config/web3");
const PlatformRegistryABI = require("../../abi/PlatformRegistry.json");
const logger = require("../../utils/logger");
const authService = require("../../services/auth");
const walletService = require("../../services/wallet");
const blockchainService = require("../../services/blockchain");
const { devicePassword } = require("../../config/web3");

/**
 * PlatformRegistry 소유권 이전 (ABC Wallet WaaS API 사용)
 * @route POST /api/nft/platform/transfer-ownership
 * @desc PlatformRegistry 컨트랙트의 소유권을 새로운 주소로 이전합니다. (ABC Wallet WaaS API 사용)
 */
exports.transferOwnership = async (req, res) => {
  try {
    const { newOwner } = req.body;
    const accessToken = req.token;

    // 입력값 검증
    if (!newOwner || !web3.utils.isAddress(newOwner)) {
      return res.status(400).json({
        success: false,
        message: "유효한 새로운 소유자 주소를 입력해주세요.",
      });
    }

    // 현재 소유자 확인
    const currentOwner = await platformRegistryContract.methods.owner().call();

    // 1. 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    const encryptedDevicePassword = authService.encrypt(
      secureChannelRes,
      devicePassword
    );

    // 2. 지갑 정보 조회 및 필요시 생성
    let walletData = await walletService.getWallet(accessToken);
    let email = walletData.email;
    walletData = await walletService.createWallet(
      email,
      encryptedDevicePassword,
      secureChannelRes.ChannelID,
      accessToken
    );

    // 3. transferOwnership 함수 데이터 생성
    const transferOwnershipData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transferOwnership",
        type: "function",
        inputs: [{ type: "address", name: "newOwner" }],
      },
      [newOwner]
    );

    // 4. 트랜잭션 데이터 준비
    const txData = {
      to: platformRegistryAddress,
      data: transferOwnershipData,
      value: "0",
    };

    // 5. 트랜잭션 서명 및 전송
    console.log("Starting transaction signing...");
    const signedTx = await blockchainService.signTransaction(
      secureChannelRes,
      walletData,
      txData,
      accessToken
    );

    console.log("Signed Transaction:", signedTx);
    console.log("Starting transaction sending...");

    const txHash = await blockchainService.sendTransaction(signedTx);

    console.log("Transaction Hash:", txHash);
    console.log("Transaction sent successfully!");

    logger.info(
      `PlatformRegistry ownership transferred from ${currentOwner} to ${newOwner}. Tx Hash: ${txHash}`
    );

    return res.json({
      success: true,
      data: {
        previousOwner: currentOwner,
        newOwner: newOwner,
        txHash: txHash,
        message: `PlatformRegistry 소유권이 ${currentOwner}에서 ${newOwner}로 이전되었습니다.`,
      },
    });
  } catch (error) {
    logger.error("Transfer ownership error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer ownership",
    });
  }
};

/**
 * PlatformRegistry 현재 소유자 조회
 * @route GET /api/nft/platform/owner
 * @desc PlatformRegistry 컨트랙트의 현재 소유자를 조회합니다.
 */
exports.getOwner = async (req, res) => {
  try {
    const currentOwner = await platformRegistryContract.methods.owner().call();

    return res.json({
      success: true,
      data: {
        owner: currentOwner,
        description: "PlatformRegistry 컨트랙트의 현재 소유자",
      },
    });
  } catch (error) {
    logger.error("Get owner error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get owner",
    });
  }
};

/**
 * PlatformRegistry 상태 조회
 * @route GET /api/nft/platform/status
 * @desc PlatformRegistry의 현재 상태를 조회합니다 (소유자, 등록된 팩토리들, SBT 컨트랙트).
 */
exports.getStatus = async (req, res) => {
  try {
    const owner = await platformRegistryContract.methods.owner().call();
    const merchandiseFactory = await platformRegistryContract.methods
      .merchandiseFactory()
      .call();
    const ipnftFactory = await platformRegistryContract.methods
      .ipnftFactory()
      .call();
    const sbtContract = await platformRegistryContract.methods
      .sbtContract()
      .call();

    return res.json({
      success: true,
      data: {
        owner: owner,
        merchandiseFactory: merchandiseFactory,
        ipnftFactory: ipnftFactory,
        sbtContract: sbtContract,
        description: "PlatformRegistry 전체 상태",
      },
    });
  } catch (error) {
    logger.error("Get status error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get status",
    });
  }
};

/**
 * 팩토리 설정 (ABC Wallet WaaS API 사용)
 * @route POST /api/nft/platform/set-factory
 * @desc PlatformRegistry에 새로운 팩토리를 설정합니다.
 */
exports.setFactory = async (req, res) => {
  try {
    const { factoryType, factoryAddress } = req.body;
    const accessToken = req.token;

    // 입력값 검증
    if (
      !factoryType ||
      !factoryAddress ||
      !web3.utils.isAddress(factoryAddress)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효한 팩토리 타입과 주소를 입력해주세요.",
      });
    }

    if (factoryType !== "merchandise" && factoryType !== "ipnft") {
      return res.status(400).json({
        success: false,
        message: "팩토리 타입은 'merchandise' 또는 'ipnft'여야 합니다.",
      });
    }

    // 1. 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    const encryptedDevicePassword = authService.encrypt(
      secureChannelRes,
      devicePassword
    );

    // 2. 지갑 정보 조회 및 필요시 생성
    let walletData = await walletService.getWallet(accessToken);
    let email = walletData.email;
    walletData = await walletService.createWallet(
      email,
      encryptedDevicePassword,
      secureChannelRes.ChannelID,
      accessToken
    );

    // 3. 팩토리 설정 함수 데이터 생성
    let setFactoryData;
    if (factoryType === "merchandise") {
      setFactoryData = web3.eth.abi.encodeFunctionCall(
        {
          name: "setMerchandiseFactory",
          type: "function",
          inputs: [{ type: "address", name: "_factory" }],
        },
        [factoryAddress]
      );
    } else {
      setFactoryData = web3.eth.abi.encodeFunctionCall(
        {
          name: "setIPNFTFactory",
          type: "function",
          inputs: [{ type: "address", name: "_factory" }],
        },
        [factoryAddress]
      );
    }

    // 4. 트랜잭션 데이터 준비
    const txData = {
      to: platformRegistryAddress,
      data: setFactoryData,
      value: "0",
    };

    // 5. 트랜잭션 서명 및 전송
    console.log("Starting factory setting transaction signing...");
    const signedTx = await blockchainService.signTransaction(
      secureChannelRes,
      walletData,
      txData,
      accessToken
    );

    console.log("Signed Transaction:", signedTx);
    console.log("Starting transaction sending...");

    const txHash = await blockchainService.sendTransaction(signedTx);

    console.log("Transaction Hash:", txHash);
    console.log("Factory setting transaction sent successfully!");

    logger.info(
      `${factoryType} factory set to ${factoryAddress}. Tx Hash: ${txHash}`
    );

    return res.json({
      success: true,
      data: {
        factoryType: factoryType,
        factoryAddress: factoryAddress,
        txHash: txHash,
        message: `${factoryType} 팩토리가 ${factoryAddress}로 설정되었습니다.`,
      },
    });
  } catch (error) {
    logger.error("Set factory error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to set factory",
    });
  }
};

/**
 * 모든 주요 컨트랙트 주소 및 Admin 주소 반환
 * @route GET /api/nft/platform/addresses
 */
exports.getAddresses = async (req, res) => {
  try {
    // IPNFT 주소는 팩토리에서 동적으로 조회
    let ipnftAddress = null;
    try {
      ipnftAddress = await ipnftFactoryContract.methods
        .getIPNFTAddress()
        .call();
    } catch (e) {
      ipnftAddress = null;
    }
    // MerchandiseFactory 주소는 PlatformRegistry에서 동적으로 조회
    let merchandiseFactory = null;
    try {
      merchandiseFactory = await platformRegistryContract.methods
        .merchandiseFactory()
        .call();
    } catch (e) {
      merchandiseFactory = null;
    }
    return res.json({
      success: true,
      data: {
        platformRegistry: platformRegistryAddress,
        creatorSBT: creatorSBTAddress,
        merchandiseFactory: merchandiseFactory,
        ipnftFactory: ipnftFactoryAddress,
        ipnft: ipnftAddress,
        dpToken: dpTokenAddress,
        admin: web3Config.platformAdmin,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get contract addresses",
    });
  }
};
