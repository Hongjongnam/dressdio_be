const {
  web3,
  sbtContract,
  dressdioAdminAccount,
} = require("../../config/web3");
const logger = require("../../utils/logger");
const {
  validateWalletAddress,
  validateCreatorType,
} = require("../../utils/validator");
const { IPFS_URIS } = require("../../utils/constants");
const mpcService = require("../../services/blockchainMPC");
const walletService = require("../../services/wallet");

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
 * SBT 발행
 * @param {Object} req - Express request object
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {string} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {string} req.body.creatorWalletAddress - 크리에이터 지갑 주소
 * @param {string} req.body.creatorType - 크리에이터 타입
 * @param {string} req.body.creatorName - 크리에이터 이름
 * @param {string} req.body.description - SBT 설명
 * @param {Object} res - Express response object
 */
exports.mintSbt = async (req, res) => {
  const {
    devicePassword,
    storedWalletData,
    creatorWalletAddress,
    creatorType,
    creatorName,
    description,
  } = req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (!devicePassword || !storedWalletData) {
      return res.status(400).json({
        status: "error",
        message:
          "Device password and storedWalletData are required for SBT minting",
      });
    }

    // 2. 관리자 권한 확인
    const userWalletAddress = req.wallet.address;
    const { platformRegistryContract } = require("../../config/web3");
    const adminWalletAddress = (
      await platformRegistryContract.methods.owner().call()
    ).toLowerCase();

    if (userWalletAddress !== adminWalletAddress) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Only platform admin can mint SBT",
      });
    }

    // 3. 입력값 검증
    if (!validateWalletAddress(creatorWalletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid creator wallet address format",
      });
    }

    const normalizedCreatorType = creatorType.toLowerCase();
    if (!validateCreatorType(normalizedCreatorType)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid creator type.`,
      });
    }

    // 4. 중복 SBT 확인
    const hasSbt = await sbtContract.methods
      .hasCreatorSbt(creatorWalletAddress, normalizedCreatorType)
      .call();

    if (hasSbt) {
      return res.status(409).json({
        status: "error",
        message: "SBT already exists for this creator wallet address and type",
      });
    }

    // 5. SBT 민팅 트랜잭션 데이터 준비
    const tokenUri = IPFS_URIS[normalizedCreatorType];
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

    // 6. MPC 서비스를 통해 트랜잭션 실행
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    // 7. 영수증에서 TokenID 파싱
    const transferEventTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferLog = receipt.logs.find(
      (log) => log.topics[0] === transferEventTopic
    );

    let tokenId = null;
    if (transferLog && transferLog.topics.length > 3) {
      tokenId = web3.utils.hexToNumberString(transferLog.topics[3]);
    }

    return res.status(200).json({
      status: "success",
      data: {
        txHash: receipt.transactionHash,
        tokenId: tokenId,
        message: "SBT minted successfully.",
      },
    });
  } catch (error) {
    logger.error("[SBT/MINT] error:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to mint SBT via MPC Wallet",
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
 * SBT 소유권 이전
 * @param {Object} req - Express request object
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {string} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {string} req.body.fromAddress - 현재 소유자 주소
 * @param {string} req.body.toAddress - 새로운 소유자 주소
 * @param {Object} res - Express response object
 */
exports.transferSbtOwnership = async (req, res) => {
  const { devicePassword, storedWalletData, fromAddress, toAddress } = req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (!devicePassword || !storedWalletData) {
      return res.status(400).json({
        status: "error",
        message:
          "Device password and storedWalletData are required for this operation.",
      });
    }

    // 2. 사용자 지갑 주소 확인
    const walletInfo = await walletService.getWallet(accessToken);
    const userWalletAddress = (walletInfo.address || "").toLowerCase();

    // 3. 권한 확인
    if (userWalletAddress !== (fromAddress || "").toLowerCase()) {
      return res.status(403).json({
        status: "error",
        message:
          "Unauthorized: You can only transfer ownership from your own wallet.",
      });
    }

    // 4. 주소 유효성 검증
    if (
      !validateWalletAddress(fromAddress) ||
      !validateWalletAddress(toAddress)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid wallet address format",
      });
    }

    // 5. 트랜잭션 데이터 생성
    const transferData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transferFrom",
        type: "function",
        inputs: [
          { type: "address", name: "from" },
          { type: "address", name: "to" },
          { type: "uint256", name: "tokenId" },
        ],
      },
      [
        fromAddress,
        toAddress,
        await sbtContract.methods.getTokenIdByAddress(fromAddress).call(),
      ]
    );

    const txData = {
      to: sbtContract.options.address,
      data: transferData,
      value: "0",
    };

    // 6. MPC 서비스를 통해 트랜잭션 실행
    const txHash = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    return res.status(200).json({
      status: "success",
      data: {
        txHash,
        message: "SBT ownership transferred successfully.",
      },
    });
  } catch (error) {
    logger.error("[SBT/TRANSFER] error:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to transfer SBT ownership.",
    });
  }
};
