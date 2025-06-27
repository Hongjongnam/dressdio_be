const {
  web3,
  adminAccount,
  CHAIN_ID,
  checkConnection,
  sbtContract,
  dressdioAdminAccount,
  PLATFORM_ADMIN_WALLET_ADDRESS,
  web3Config,
} = require("../../config/web3");
const SBT = require("../../models/sbt");
const logger = require("../../utils/logger");
const { toLowerCase, stringifyBigInts } = require("../../utils/utils");
const { CREATOR_TYPES, IPFS_URIS } = require("../../utils/constants");
const {
  validateWalletAddress,
  validateCreatorType,
} = require("../../utils/validator");
const { sendTransaction } = require("../../services/blockchain");
const {
  validateAccessTokenAndGetWallet,
  sendTransactionViaABCWallet,
} = require("../../services/auth");
const walletService = require("../../services/wallet");
const authService = require("../../services/auth");
const blockchainService = require("../../services/blockchain");

// Utility functions
const formatSbtInfo = (sbt) => ({
  tokenId: sbt.tokenId.toString(),
  owner: sbt.owner,
  creatorType: sbt.creatorType,
  creatorName: sbt.creatorName,
  description: sbt.description,
  tokenURI: sbt.tokenUri,
  useCount: sbt.useCount?.toString(),
});

/**
 * SBT 컨트롤러
 * Soulbound Token 발행 및 관리 기능
 */

/**
 * SBT 발행
 * @param {Object} req - Express request object
 * @param {string} req.body.accessToken - Platform Admin Wallet Address 대신 access token 사용
 * @param {string} req.body.creatorWalletAddress - 지갑 주소
 * @param {string} req.body.creatorType - 크리에이터 타입
 * @param {string} req.body.creatorName - 크리에이터 이름
 * @param {string} req.body.description - SBT 설명
 * @param {Object} res - Express response object
 */
exports.mintSbt = async (req, res) => {
  const accessToken = req.body.accessToken;
  const creatorWalletAddress = req.body.creatorWalletAddress;
  const creatorType = req.body.creatorType;
  const creatorName = req.body.creatorName;
  const description = req.body.description;

  // 1. accessToken으로 walletService에서 직접 지갑 주소 조회
  let userWalletAddress;
  let email;
  try {
    const walletInfo = await walletService.getWallet(accessToken);
    userWalletAddress = (walletInfo.address || "").toLowerCase();
    email = walletInfo.email;
    console.log("[SBT/MINT] accessToken wallet address:", userWalletAddress);
  } catch (error) {
    return res
      .status(401)
      .json({ status: "error", message: "Invalid or expired access token" });
  }

  // 2. 관리자 지갑 주소와 일치하는지 확인
  let adminWalletAddress;
  try {
    // PlatformRegistry의 현재 owner를 동적으로 조회
    const { platformRegistryContract } = require("../../config/web3");
    adminWalletAddress = (
      await platformRegistryContract.methods.owner().call()
    ).toLowerCase();
    console.log(
      "[SBT/MINT] PlatformRegistry current owner:",
      adminWalletAddress
    );
  } catch (error) {
    console.error("[SBT/MINT] Failed to get PlatformRegistry owner:", error);
    // 폴백으로 환경 변수 사용
    adminWalletAddress = (
      process.env.PLATFORM_ADMIN_WALLET_ADDRESS || ""
    ).toLowerCase();
    console.log(
      "[SBT/MINT] Using fallback PLATFORM_ADMIN_WALLET_ADDRESS:",
      adminWalletAddress
    );
  }

  console.log("[SBT/MINT] User wallet address:", userWalletAddress);
  console.log("[SBT/MINT] Admin wallet address:", adminWalletAddress);

  if (userWalletAddress !== adminWalletAddress) {
    return res.status(403).json({
      status: "error",
      message: "Unauthorized: Only platform admin can mint SBT",
    });
  }

  // 3. 지갑 주소 형식 검증
  if (!validateWalletAddress(creatorWalletAddress)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid creator wallet address format",
    });
  }

  // 4. 크리에이터 타입 검증
  const normalizedCreatorType = creatorType.toLowerCase();
  if (!validateCreatorType(normalizedCreatorType)) {
    return res.status(400).json({
      status: "error",
      message: `Invalid creator type. Must be one of: ${Object.values(
        CREATOR_TYPES
      ).join(", ")}`,
    });
  }

  // 5. 이미 SBT 존재하는지 확인
  const hasSbt = await sbtContract.methods
    .hasCreatorSbt(creatorWalletAddress, normalizedCreatorType)
    .call();
  console.log("[SBT/MINT] hasSbt result:", hasSbt);

  if (hasSbt) {
    return res.status(409).json({
      status: "error",
      message: "SBT already exists for this creator wallet address and type",
    });
  }

  // 6. SBT 발행을 위한 준비 - 크리에이터 타입에 따라 자동으로 이미지 URI 설정
  const tokenUri = IPFS_URIS[normalizedCreatorType];
  console.log("[SBT/MINT] mint params:", {
    to: creatorWalletAddress,
    creatorType,
    creatorName,
    description,
    tokenUri,
  });

  // 7. SBT 민팅 트랜잭션 생성/서명/전송 (ABC Server 위임 방식)
  try {
    const { web3, SBT_ABI } = require("../../config/web3");

    // 1) 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    const encryptedDevicePassword = authService.encrypt(
      secureChannelRes,
      process.env.DEVICE_PASSWORD
    );

    // 2) 지갑 정보 조회 및 필요시 생성
    let walletData = await walletService.getWallet(accessToken);
    walletData = await walletService.createWallet(
      email,
      encryptedDevicePassword,
      secureChannelRes.ChannelID,
      accessToken
    );
    console.log("[SBT/MINT] walletData:", walletData);

    // 3) SBT 민팅용 트랜잭션 데이터 준비
    const mintData = web3.eth.abi.encodeFunctionCall(
      {
        name: "mint",
        type: "function",
        inputs: [
          { type: "address", name: "to" },
          { type: "string", name: "creatorType" },
          { type: "string", name: "creatorName" },
          { type: "string", name: "description" },
          { type: "string", name: "tokenUri" },
        ],
      },
      [creatorWalletAddress, creatorType, creatorName, description, tokenUri]
    );

    const txData = {
      to: sbtContract.options.address,
      data: mintData,
      value: "0",
    };
    console.log("[SBT/MINT] txData:", txData);

    // SBT 컨트랙트 owner 확인
    const sbtOwner = await sbtContract.methods.owner().call();
    console.log("[SBT/MINT] SBT contract owner:", sbtOwner);

    // 4) 트랜잭션 서명 및 전송 (ABC Server에 위임)
    const signedTx = await blockchainService.signTransaction(
      secureChannelRes,
      walletData,
      txData,
      accessToken
    );
    console.log("[SBT/MINT] signedTx:", signedTx);

    const txHash = await blockchainService.sendTransaction(signedTx);
    console.log("[SBT/MINT] txHash:", txHash);

    return res.status(200).json({
      status: "success",
      data: {
        txHash,
        creatorType: normalizedCreatorType,
        imageUri: tokenUri,
        message: `SBT minted successfully for ${creatorType} type with auto-assigned image URI`,
      },
    });
  } catch (error) {
    console.error("[SBT/MINT] error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to mint SBT via ABC Wallet",
      error: error.message,
    });
  }
};

/**
 * 지갑 주소로 SBT 정보 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.walletAddress - 지갑 주소
 * @param {Object} res - Express response object
 */
exports.getSbtByWalletAddress = async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({
        status: "error",
        message: "Wallet address is required",
      });
    }

    if (!validateWalletAddress(walletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid wallet address format",
      });
    }

    const sbtInfo = await sbtContract.methods
      .getSBTInfoByAddress(walletAddress)
      .call();

    if (!sbtInfo || sbtInfo.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address",
      });
    }

    const formattedSbtInfo = sbtInfo.map(formatSbtInfo);

    res.status(200).json({
      status: "success",
      message: "SBT info retrieved successfully",
      data: formattedSbtInfo,
    });
  } catch (error) {
    logger.error("SBT retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBT info",
      error: error.message,
    });
  }
};

/**
 * 관리자 지갑 잔액 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAdminBalance = async (req, res) => {
  try {
    const balanceWei = await web3.eth.getBalance(dressdioAdminAccount.address);
    const balanceEth = web3.utils.fromWei(balanceWei, "ether");

    res.status(200).json({
      status: "success",
      address: dressdioAdminAccount.address,
      balance: balanceEth,
      unit: "ETH",
    });
  } catch (error) {
    logger.error("Admin balance retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch admin balance",
      error: error.message,
    });
  }
};

/**
 * 데이터베이스에서 지갑 주소로 SBT 정보 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.walletAddress - 지갑 주소
 * @param {Object} res - Express response object
 */
exports.getSBT = async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({
        status: "error",
        message: "Wallet address is required",
      });
    }

    if (!validateWalletAddress(walletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid wallet address format",
      });
    }

    const sbtInfo = await SBT.findAll({
      where: { owner: walletAddress },
      order: [["createdAt", "DESC"]],
    });

    if (!sbtInfo || sbtInfo.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address",
      });
    }

    const formattedSbtInfo = sbtInfo.map((sbt) => ({
      tokenId: sbt.tokenId,
      owner: sbt.owner,
      creatorType: sbt.creatorType,
      creatorName: sbt.creatorName,
      description: sbt.description,
      tokenURI: sbt.tokenURI,
      transactionHash: sbt.transactionHash,
      useCount: sbt.useCount,
      createdAt: sbt.createdAt,
      updatedAt: sbt.updatedAt,
    }));

    res.status(200).json({
      status: "success",
      message: "SBT info retrieved successfully from database",
      data: formattedSbtInfo,
    });
  } catch (error) {
    logger.error("Database SBT retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBT info from database",
      error: error.message,
    });
  }
};

/**
 * 모든 SBT 정보 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllSBTs = async (req, res) => {
  try {
    const sbtInfos = await sbtContract.methods.getAllSBTs().call();

    if (!sbtInfos || sbtInfos.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No SBTs found",
      });
    }

    const formattedSbtInfos = sbtInfos.map(formatSbtInfo);

    res.status(200).json({
      status: "success",
      message: "All SBTs retrieved successfully",
      data: formattedSbtInfos,
    });
  } catch (error) {
    logger.error("SBT retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBTs",
      error: error.message,
    });
  }
};

/**
 * SBT 정보 조회 (토큰 ID로)
 * @param {Object} req - Express request object
 * @param {string} req.params.sbtId - SBT 토큰 ID
 * @param {Object} res - Express response object
 */
exports.getSbtInfo = async (req, res) => {
  try {
    const { sbtId } = req.params;

    if (!sbtId || isNaN(sbtId)) {
      return res.status(400).json({
        status: "error",
        message: "Valid SBT ID is required",
      });
    }

    const sbtInfo = await sbtContract.methods.getSBTInfoById(sbtId).call();

    if (
      !sbtInfo ||
      !sbtInfo.owner ||
      sbtInfo.owner === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        status: "error",
        message: "SBT not found",
      });
    }

    const formattedSbtInfo = formatSbtInfo(sbtInfo);

    res.status(200).json({
      status: "success",
      message: "SBT info retrieved successfully",
      data: formattedSbtInfo,
    });
  } catch (error) {
    logger.error("SBT info retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBT info",
      error: error.message,
    });
  }
};

/**
 * SBT 컨트랙트 소유권 이전
 * @param {Object} req - Express request object
 * @param {string} req.body.accessToken - Platform Admin access token
 * @param {string} req.body.newOwner - 새로운 소유자 주소
 * @param {Object} res - Express response object
 */
exports.transferSbtOwnership = async (req, res) => {
  const accessToken = req.body.accessToken;
  const newOwner = req.body.newOwner;

  // 1. accessToken으로 walletService에서 직접 지갑 주소 조회
  let userWalletAddress;
  let email;
  try {
    const walletInfo = await walletService.getWallet(accessToken);
    userWalletAddress = (walletInfo.address || "").toLowerCase();
    email = walletInfo.email;
    console.log(
      "[SBT/TRANSFER_OWNERSHIP] accessToken wallet address:",
      userWalletAddress
    );
  } catch (error) {
    return res
      .status(401)
      .json({ status: "error", message: "Invalid or expired access token" });
  }

  // 2. SBT 컨트랙트의 현재 owner와 일치하는지 확인
  let sbtOwnerAddress;
  try {
    sbtOwnerAddress = (await sbtContract.methods.owner().call()).toLowerCase();
    console.log(
      "[SBT/TRANSFER_OWNERSHIP] SBT contract current owner:",
      sbtOwnerAddress
    );
  } catch (error) {
    console.error(
      "[SBT/TRANSFER_OWNERSHIP] Failed to get SBT contract owner:",
      error
    );
    return res.status(500).json({
      status: "error",
      message: "Failed to get SBT contract owner",
    });
  }

  if (userWalletAddress !== sbtOwnerAddress) {
    return res.status(403).json({
      status: "error",
      message: "Unauthorized: Only SBT contract owner can transfer ownership",
    });
  }

  // 3. 새로운 소유자 주소 검증
  if (!validateWalletAddress(newOwner)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid new owner address format",
    });
  }

  // 4. SBT 컨트랙트 소유권 이전
  try {
    // 1) 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    const encryptedDevicePassword = authService.encrypt(
      secureChannelRes,
      process.env.DEVICE_PASSWORD
    );

    // 2) 지갑 정보 조회 및 필요시 생성
    let walletData = await walletService.getWallet(accessToken);
    walletData = await walletService.createWallet(
      email,
      encryptedDevicePassword,
      secureChannelRes.ChannelID,
      accessToken
    );

    // 3) transferOwnership 함수 데이터 생성
    const transferOwnershipData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transferOwnership",
        type: "function",
        inputs: [{ type: "address", name: "newOwner" }],
      },
      [newOwner]
    );

    const txData = {
      to: sbtContract.options.address,
      data: transferOwnershipData,
      value: "0",
    };

    console.log("[SBT/TRANSFER_OWNERSHIP] txData:", txData);

    // 4) 트랜잭션 서명 및 전송
    const signedTx = await blockchainService.signTransaction(
      secureChannelRes,
      walletData,
      txData,
      accessToken
    );

    const txHash = await blockchainService.sendTransaction(signedTx);
    console.log("[SBT/TRANSFER_OWNERSHIP] txHash:", txHash);

    return res.status(200).json({
      status: "success",
      data: {
        txHash,
        previousOwner: userWalletAddress,
        newOwner: newOwner,
        message: `SBT contract ownership transferred from ${userWalletAddress} to ${newOwner}`,
      },
    });
  } catch (error) {
    console.error("[SBT/TRANSFER_OWNERSHIP] error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to transfer SBT ownership",
      error: error.message,
    });
  }
};
