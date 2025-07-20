const {
  web3,
  platformRegistryContract,
  platformRegistryAddress,
  creatorSBTAddress,
  sbtContractAddress,
  ipnftFactoryAddress,
  merchandiseFactoryAddress,
  dpTokenAddress,
  web3Config,
  ipnftFactoryContract,
  sbtContract,
  merchandiseFactoryContract,
} = require("../../config/web3");
const logger = require("../../utils/logger");
const walletService = require("../../services/wallet");
const mpcService = require("../../services/blockchainMPC");
const { stringifyBigInts } = require("../../utils/utils");

// 컨트랙트 정보 매핑
const CONTRACTS = {
  platformRegistry: {
    name: "PlatformRegistry",
    contract: platformRegistryContract,
    address: platformRegistryAddress,
  },
  sbtContract: {
    name: "SBT Contract",
    contract: sbtContract,
    address: sbtContractAddress,
  },
  ipnftFactory: {
    name: "IPNFTFactory",
    contract: ipnftFactoryContract,
    address: ipnftFactoryAddress,
  },
  merchandiseFactory: {
    name: "MerchandiseFactory",
    contract: merchandiseFactoryContract,
    address: merchandiseFactoryAddress,
  },
};

/**
 * 입력값 검증 유틸리티
 */
const validateInputs = (req, res) => {
  const { newOwner, devicePassword, storedWalletData } = req.body;

  if (!newOwner || !web3.utils.isAddress(newOwner)) {
    return {
      valid: false,
      response: res.status(400).json({
        success: false,
        message: "유효한 새로운 소유자 주소를 입력해주세요.",
      }),
    };
  }

  if (!devicePassword) {
    return {
      valid: false,
      response: res.status(400).json({
        success: false,
        message: "장치 비밀번호를 입력해주세요.",
      }),
    };
  }

  if (!storedWalletData) {
    return {
      valid: false,
      response: res.status(400).json({
        success: false,
        message: "로컬스토리지 서명데이터가 필요합니다.",
      }),
    };
  }

  return { valid: true, data: { newOwner, devicePassword, storedWalletData } };
};

/**
 * 소유권 이전 트랜잭션 실행
 */
const executeOwnershipTransfer = async (
  contractKey,
  newOwner,
  storedWalletData,
  devicePassword,
  accessToken
) => {
  const contract = CONTRACTS[contractKey];

  try {
    // 현재 소유자 확인
    const currentOwner = await contract.contract.methods.owner().call();

    // 이미 동일한 소유자인 경우
    if (currentOwner.toLowerCase() === newOwner.toLowerCase()) {
      return {
        success: true,
        message: "이미 동일한 소유자",
        previousOwner: currentOwner,
        newOwner: newOwner,
      };
    }

    // transferOwnership 함수 데이터 생성
    const transferData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transferOwnership",
        type: "function",
        inputs: [{ type: "address", name: "newOwner" }],
      },
      [newOwner]
    );

    // 트랜잭션 데이터 준비
    const txData = {
      to: contract.address,
      data: transferData,
      value: "0",
    };

    // 트랜잭션 실행
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    logger.info(
      `${contract.name} ownership transferred from ${currentOwner} to ${newOwner}. Tx Hash: ${receipt.transactionHash}`
    );

    return {
      success: true,
      previousOwner: currentOwner,
      newOwner: newOwner,
      txHash: receipt.transactionHash,
      receipt: stringifyBigInts(receipt),
    };
  } catch (error) {
    logger.error(
      `${contract.name} ownership transfer failed: ${error.message}`
    );
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 권한 검증
 */
const validateOwnership = async (walletAddress, contractKey) => {
  const contract = CONTRACTS[contractKey];
  const currentOwner = await contract.contract.methods.owner().call();

  return currentOwner.toLowerCase() === walletAddress.toLowerCase();
};

/**
 * 통합 소유권 이전 (ABC Wallet WaaS API 사용)
 * @route POST /api/nft/platform/transfer-all-ownership
 * @desc PlatformRegistry, SBT, IPNFTFactory, MerchandiseFactory의 소유권을 모두 새로운 주소로 이전합니다.
 */
exports.transferAllOwnership = async (req, res) => {
  try {
    const accessToken = req.token;

    // 입력값 검증
    const validation = validateInputs(req, res);
    if (!validation.valid) {
      return validation.response;
    }

    const { newOwner, devicePassword, storedWalletData } = validation.data;

    // 사용자 정보 조회
    const walletInfo = await walletService.getWallet(accessToken);
    console.log("[transferAllOwnership] 사용자 주소:", walletInfo.address);

    // PlatformRegistry 권한 검증
    const hasPlatformAccess = await validateOwnership(
      walletInfo.address,
      "platformRegistry"
    );
    if (!hasPlatformAccess) {
      return res.status(403).json({
        success: false,
        message:
          "권한 부족: PlatformRegistry의 현재 소유자만 모든 소유권을 이전할 수 있습니다.",
      });
    }

    // 장치 비밀번호 검증을 위한 테스트 트랜잭션
    try {
      const testTxData = {
        to: platformRegistryAddress,
        data: web3.eth.abi.encodeFunctionCall(
          { name: "owner", type: "function", inputs: [] },
          []
        ),
        value: "0",
      };

      await mpcService.executeTransactionWithStoredData(
        storedWalletData,
        devicePassword,
        testTxData,
        accessToken
      );
      console.log("[transferAllOwnership] 장치 비밀번호 검증 성공");
    } catch (error) {
      console.error(
        "[transferAllOwnership] 장치 비밀번호 검증 실패:",
        error.message
      );
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: error.message,
      });
    }

    // 각 컨트랙트 소유권 이전 실행
    const contractKeys = [
      "platformRegistry",
      "sbtContract",
      "ipnftFactory",
      "merchandiseFactory",
    ];
    const results = {};
    const errors = [];

    for (const contractKey of contractKeys) {
      const result = await executeOwnershipTransfer(
        contractKey,
        newOwner,
        storedWalletData,
        devicePassword,
        accessToken
      );

      if (result.success) {
        results[contractKey] = result;
      } else {
        errors.push({
          contract: CONTRACTS[contractKey].name,
          error: result.error,
          status: "failed",
        });
      }
    }

    // 결과 요약
    const successCount = Object.keys(results).length;
    const totalCount = contractKeys.length;

    logger.info("통합 소유권 이전 완료", {
      previousOwner: walletInfo.address,
      newOwner: newOwner,
      results: results,
      successCount: successCount,
      totalCount: totalCount,
    });

    return res.json({
      success: true,
      data: stringifyBigInts({
        previousOwner: walletInfo.address,
        newOwner: newOwner,
        results: results,
        errors: errors,
        successCount: successCount,
        totalCount: totalCount,
        message: `소유권 이전 완료: ${successCount}/${totalCount} 컨트랙트 성공`,
      }),
    });
  } catch (error) {
    logger.error("Transfer all ownership error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer all ownership",
    });
  }
};

/**
 * PlatformRegistry 소유권 이전 (ABC Wallet WaaS API 사용)
 * @route POST /api/nft/platform/transfer-ownership
 * @desc PlatformRegistry 컨트랙트의 소유권을 새로운 주소로 이전합니다.
 */
exports.transferOwnership = async (req, res) => {
  try {
    const accessToken = req.token;

    // 입력값 검증
    const validation = validateInputs(req, res);
    if (!validation.valid) {
      return validation.response;
    }

    const { newOwner, devicePassword, storedWalletData } = validation.data;

    // PlatformRegistry 소유권 이전 실행
    const result = await executeOwnershipTransfer(
      "platformRegistry",
      newOwner,
      storedWalletData,
      devicePassword,
      accessToken
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || "Failed to transfer ownership",
      });
    }

    return res.json({
      success: true,
      data: stringifyBigInts({
        previousOwner: result.previousOwner,
        newOwner: result.newOwner,
        txHash: result.txHash,
        message: `PlatformRegistry 소유권이 ${result.previousOwner}에서 ${result.newOwner}로 이전되었습니다.`,
        receipt: result.receipt,
      }),
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
    const { factoryType, factoryAddress, devicePassword, storedWalletData } =
      req.body;
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

    if (!devicePassword || !storedWalletData) {
      return res.status(400).json({
        success: false,
        message: "장치 비밀번호와 로컬스토리지 서명데이터가 필요합니다.",
      });
    }

    // 팩토리 설정 함수 데이터 생성
    const functionName =
      factoryType === "merchandise"
        ? "setMerchandiseFactory"
        : "setIPNFTFactory";
    const setFactoryData = web3.eth.abi.encodeFunctionCall(
      {
        name: functionName,
        type: "function",
        inputs: [{ type: "address", name: "_factory" }],
      },
      [factoryAddress]
    );

    // 트랜잭션 데이터 준비
    const txData = {
      to: platformRegistryAddress,
      data: setFactoryData,
      value: "0",
    };

    // 트랜잭션 실행
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    logger.info(
      `${factoryType} factory set to ${factoryAddress}. Tx Hash: ${receipt.transactionHash}`
    );

    return res.json({
      success: true,
      data: stringifyBigInts({
        factoryType: factoryType,
        factoryAddress: factoryAddress,
        txHash: receipt.transactionHash,
        message: `${factoryType} 팩토리가 ${factoryAddress}로 설정되었습니다.`,
        receipt: receipt,
      }),
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

    // 현재 PlatformRegistry 소유자를 동적으로 조회
    let currentAdmin = null;
    try {
      currentAdmin = await platformRegistryContract.methods.owner().call();
    } catch (e) {
      currentAdmin = web3Config.platformAdmin; // 폴백으로 환경 변수 값 사용
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
        admin: currentAdmin,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get contract addresses",
    });
  }
};
