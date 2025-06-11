const {
  web3,
  adminAccount,
  CHAIN_ID,
  checkConnection,
  sbtContract,
  dressdioAdminAccount,
  PLATFORM_ADMIN_WALLET_ADDRESS,
} = require("../../config/web3");
const SBT = require("../../models/sbt");
const logger = require("../../utils/logger");

// Constants
const CREATOR_TYPES = {
  ARTIST: "artist",
  INFLUENCER: "influencer",
  BRAND: "brand",
};

const IPFS_URIS = {
  [CREATOR_TYPES.ARTIST]:
    "https://ipfs.io/ipfs/QmVjNKowy3nqoaA7atZe615R7XcVcu2eMPknmimHnbybyV",
  [CREATOR_TYPES.INFLUENCER]:
    "https://ipfs.io/ipfs/QmWA53Ma6jos1SqWA8b8ZuRKJh2bm5U26YYE5soHmKR38T",
  [CREATOR_TYPES.BRAND]:
    "https://ipfs.io/ipfs/QmX39UUBB2KVGs27qXscrqZYLmibDcUSUx5pnf8MoFEDHC",
};

// Utility functions
const validateWalletAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const validateCreatorType = (type) => {
  const normalizedType = type.toLowerCase();
  return Object.values(CREATOR_TYPES).includes(normalizedType);
};

const formatSbtInfo = (sbt) => ({
  tokenId: sbt.tokenId.toString(),
  owner: sbt.owner,
  creatorType: sbt.creatorType,
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
 * @param {string} req.body.platformAdminWalletAddress - 플랫폼 어드민 지갑 주소
 * @param {string} req.body.creatorWalletAddress - 지갑 주소
 * @param {string} req.body.creatorType - 크리에이터 타입
 * @param {string} req.body.description - SBT 설명
 * @param {Object} res - Express response object
 */
exports.mintSbt = async (req, res) => {
  try {
    const {
      platformAdminWalletAddress,
      creatorWalletAddress,
      creatorType,
      description,
    } = req.body;

    // 1. 필수 파라미터 검증
    if (
      !platformAdminWalletAddress ||
      !creatorWalletAddress ||
      !creatorType ||
      !description
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: platformAdminWalletAddress, creatorWalletAddress, creatorType, description",
      });
    }

    // 2. 플랫폼 관리자 주소 검증
    if (
      platformAdminWalletAddress.toLowerCase() !==
      PLATFORM_ADMIN_WALLET_ADDRESS.toLowerCase()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Invalid platform admin wallet address",
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

    if (hasSbt) {
      return res.status(409).json({
        status: "error",
        message: "SBT already exists for this creator wallet address and type",
      });
    }

    // 6. SBT 발행을 위한 준비
    const tokenUri = IPFS_URIS[normalizedCreatorType];

    // 7. 컨트랙트 소유자 확인
    const owner = await sbtContract.methods.owner().call();
    if (owner.toLowerCase() !== dressdioAdminAccount.address.toLowerCase()) {
      return res.status(403).json({
        status: "error",
        message: "Dressdio admin is not the contract owner",
      });
    }

    // 8. 트랜잭션 데이터 구성
    const mintData = sbtContract.methods
      .mint(creatorWalletAddress, normalizedCreatorType, description, tokenUri)
      .encodeABI();

    const nonce = await web3.eth.getTransactionCount(
      dressdioAdminAccount.address,
      "latest"
    );

    const tx = {
      from: dressdioAdminAccount.address,
      to: sbtContract.options.address,
      data: mintData,
      gas: 300000,
      gasPrice: "0",
      nonce,
      chainId: 1337,
    };

    // 9. 트랜잭션 서명 및 전송
    const signedTx = await web3.eth.accounts.signTransaction(
      tx,
      dressdioAdminAccount.privateKey
    );
    const receipt = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );

    if (!receipt.status) {
      throw new Error("Transaction failed");
    }

    // 10. SBT 정보 조회
    const sbtInfo = await sbtContract.methods
      .getSBTInfoByAddress(creatorWalletAddress)
      .call();
    const newSbt = sbtInfo[sbtInfo.length - 1];

    // 11. DB 저장
    const sbtData = {
      tokenId: newSbt.tokenId.toString(),
      owner: newSbt.owner,
      creatorType: normalizedCreatorType,
      description: newSbt.description,
      tokenURI: newSbt.tokenUri,
      transactionHash: receipt.transactionHash,
      useCount: newSbt.useCount.toString(),
    };

    const savedSbt = await SBT.create(sbtData);

    // 12. 응답 반환
    return res.status(201).json({
      status: "success",
      message: "SBT minted successfully",
      data: {
        transactionHash: receipt.transactionHash,
        sbtInfo: sbtData,
      },
    });
  } catch (error) {
    logger.error("SBT minting error:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      status: "error",
      message: "Failed to mint SBT",
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
