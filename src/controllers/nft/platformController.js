const Web3 = require("web3");
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

/**
 * 모든 플랫폼 컨트랙트 소유권 통합 이전
 * @route POST /api/nft/platform/transfer-all-ownership
 * @desc PlatformRegistry, SBT, IPNFTFactory, MerchandiseFactory의 소유권을 모두 새로운 주소로 이전합니다.
 */
exports.transferAllOwnership = async (req, res) => {
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

    // 1. 보안 채널 생성 및 사용자 기본 정보 조회
    const secureChannel = await authService.createSecureChannel();
    const walletInfo = await walletService.getWallet(accessToken);
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      process.env.DEVICE_PASSWORD
    );
    const fullWalletData = await walletService.createWallet(
      walletInfo.email,
      encryptedDevicePassword,
      secureChannel.ChannelID,
      accessToken
    );

    console.log("[transferAllOwnership] 사용자 주소:", walletInfo.address);

    // 2. PlatformRegistry의 현재 owner 확인 (이 API를 호출할 수 있는 권한 확인)
    const platformRegistryOwner = await platformRegistryContract.methods
      .owner()
      .call();

    if (
      platformRegistryOwner.toLowerCase() !== walletInfo.address.toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "권한 부족: PlatformRegistry의 현재 소유자만 모든 소유권을 이전할 수 있습니다.",
      });
    }

    // 3. 각 컨트랙트의 현재 owner 확인
    const sbtOwner = await sbtContract.methods.owner().call();
    const ipnftFactoryOwner = await ipnftFactoryContract.methods.owner().call();
    const merchandiseFactoryOwner = await merchandiseFactoryContract.methods
      .owner()
      .call();

    console.log("[transferAllOwnership] 현재 소유자들:");
    console.log("- PlatformRegistry:", platformRegistryOwner);
    console.log("- SBT Contract:", sbtOwner);
    console.log("- IPNFTFactory:", ipnftFactoryOwner);
    console.log("- MerchandiseFactory:", merchandiseFactoryOwner);

    console.log("[transferAllOwnership] 컨트랙트 주소들:");
    console.log("- PlatformRegistry Address:", platformRegistryAddress);
    console.log("- SBT Contract Address:", sbtContract.options.address);
    console.log("- IPNFTFactory Address:", ipnftFactoryAddress);
    console.log("- MerchandiseFactory Address:", merchandiseFactoryAddress);

    console.log("[transferAllOwnership] 새로운 소유자:", newOwner);
    console.log("[transferAllOwnership] 트랜잭션 발신자:", walletInfo.address);

    // 4. 각 컨트랙트의 소유권 이전 트랜잭션 실행
    const results = {
      platformRegistry: null,
      sbtContract: null,
      ipnftFactory: null,
      merchandiseFactory: null,
    };

    // PlatformRegistry 소유권 이전
    try {
      const platformTxData = {
        to: platformRegistryAddress,
        data: web3.eth.abi.encodeFunctionCall(
          {
            name: "transferOwnership",
            type: "function",
            inputs: [{ type: "address", name: "newOwner" }],
          },
          [newOwner]
        ),
        value: "0",
      };

      const signedPlatformTx = await blockchainService.signTransaction(
        secureChannel,
        fullWalletData,
        platformTxData,
        accessToken
      );
      const platformTxHash = await blockchainService.sendTransaction(
        signedPlatformTx
      );
      results.platformRegistry = { success: true, txHash: platformTxHash };
      console.log(
        "[transferAllOwnership] PlatformRegistry 소유권 이전 완료:",
        platformTxHash
      );
    } catch (error) {
      results.platformRegistry = { success: false, error: error.message };
      console.error(
        "[transferAllOwnership] PlatformRegistry 소유권 이전 실패:",
        error.message
      );
    }

    // SBT 컨트랙트 소유권 이전 (현재 owner가 새로운 owner와 다른 경우)
    if (sbtOwner.toLowerCase() !== newOwner.toLowerCase()) {
      // SBT 컨트랙트의 현재 소유자가 트랜잭션 발신자인지 확인
      if (sbtOwner.toLowerCase() !== walletInfo.address.toLowerCase()) {
        console.log(
          `[transferAllOwnership] SBT 컨트랙트 권한 없음: 현재 소유자 ${sbtOwner}, 발신자 ${walletInfo.address}`
        );
        results.sbtContract = {
          success: false,
          error: "권한 없음: SBT 컨트랙트의 현재 소유자가 아닙니다.",
        };
      } else {
        try {
          const sbtTxData = {
            to: sbtContract.options.address,
            data: web3.eth.abi.encodeFunctionCall(
              {
                name: "transferOwnership",
                type: "function",
                inputs: [{ type: "address", name: "newOwner" }],
              },
              [newOwner]
            ),
            value: "0",
          };

          const signedSbtTx = await blockchainService.signTransaction(
            secureChannel,
            fullWalletData,
            sbtTxData,
            accessToken
          );
          const sbtTxHash = await blockchainService.sendTransaction(
            signedSbtTx
          );
          results.sbtContract = { success: true, txHash: sbtTxHash };
          console.log(
            "[transferAllOwnership] SBT 컨트랙트 소유권 이전 완료:",
            sbtTxHash
          );
        } catch (error) {
          results.sbtContract = { success: false, error: error.message };
          console.error(
            "[transferAllOwnership] SBT 컨트랙트 소유권 이전 실패:",
            error.message
          );
        }
      }
    } else {
      results.sbtContract = { success: true, message: "이미 동일한 소유자" };
    }

    // IPNFTFactory 소유권 이전 (현재 owner가 새로운 owner와 다른 경우)
    if (ipnftFactoryOwner.toLowerCase() !== newOwner.toLowerCase()) {
      // IPNFTFactory의 현재 소유자가 트랜잭션 발신자인지 확인
      if (
        ipnftFactoryOwner.toLowerCase() !== walletInfo.address.toLowerCase()
      ) {
        console.log(
          `[transferAllOwnership] IPNFTFactory 권한 없음: 현재 소유자 ${ipnftFactoryOwner}, 발신자 ${walletInfo.address}`
        );
        results.ipnftFactory = {
          success: false,
          error: "권한 없음: IPNFTFactory의 현재 소유자가 아닙니다.",
        };
      } else {
        try {
          const ipnftTxData = {
            to: ipnftFactoryAddress,
            data: web3.eth.abi.encodeFunctionCall(
              {
                name: "transferOwnership",
                type: "function",
                inputs: [{ type: "address", name: "newOwner" }],
              },
              [newOwner]
            ),
            value: "0",
          };

          const signedIpnftTx = await blockchainService.signTransaction(
            secureChannel,
            fullWalletData,
            ipnftTxData,
            accessToken
          );
          const ipnftTxHash = await blockchainService.sendTransaction(
            signedIpnftTx
          );
          results.ipnftFactory = { success: true, txHash: ipnftTxHash };
          console.log(
            "[transferAllOwnership] IPNFTFactory 소유권 이전 완료:",
            ipnftTxHash
          );
        } catch (error) {
          results.ipnftFactory = { success: false, error: error.message };
          console.error(
            "[transferAllOwnership] IPNFTFactory 소유권 이전 실패:",
            error.message
          );
        }
      }
    } else {
      results.ipnftFactory = { success: true, message: "이미 동일한 소유자" };
    }

    // MerchandiseFactory 소유권 이전 (현재 owner가 새로운 owner와 다른 경우)
    if (merchandiseFactoryOwner.toLowerCase() !== newOwner.toLowerCase()) {
      // MerchandiseFactory의 현재 소유자가 트랜잭션 발신자인지 확인
      if (
        merchandiseFactoryOwner.toLowerCase() !==
        walletInfo.address.toLowerCase()
      ) {
        console.log(
          `[transferAllOwnership] MerchandiseFactory 권한 없음: 현재 소유자 ${merchandiseFactoryOwner}, 발신자 ${walletInfo.address}`
        );
        results.merchandiseFactory = {
          success: false,
          error: "권한 없음: MerchandiseFactory의 현재 소유자가 아닙니다.",
        };
      } else {
        try {
          const merchTxData = {
            to: merchandiseFactoryAddress,
            data: web3.eth.abi.encodeFunctionCall(
              {
                name: "transferOwnership",
                type: "function",
                inputs: [{ type: "address", name: "newOwner" }],
              },
              [newOwner]
            ),
            value: "0",
          };

          const signedMerchTx = await blockchainService.signTransaction(
            secureChannel,
            fullWalletData,
            merchTxData,
            accessToken
          );
          const merchTxHash = await blockchainService.sendTransaction(
            signedMerchTx
          );
          results.merchandiseFactory = { success: true, txHash: merchTxHash };
          console.log(
            "[transferAllOwnership] MerchandiseFactory 소유권 이전 완료:",
            merchTxHash
          );
        } catch (error) {
          results.merchandiseFactory = { success: false, error: error.message };
          console.error(
            "[transferAllOwnership] MerchandiseFactory 소유권 이전 실패:",
            error.message
          );
        }
      }
    } else {
      results.merchandiseFactory = {
        success: true,
        message: "이미 동일한 소유자",
      };
    }

    // 5. 결과 요약
    const successCount = Object.values(results).filter((r) => r.success).length;
    const totalCount = Object.keys(results).length;

    logger.info("통합 소유권 이전 완료", {
      previousOwner: walletInfo.address,
      newOwner: newOwner,
      results: results,
      successCount: successCount,
      totalCount: totalCount,
    });

    return res.json({
      success: true,
      data: {
        previousOwner: walletInfo.address,
        newOwner: newOwner,
        results: results,
        successCount: successCount,
        totalCount: totalCount,
        message: `소유권 이전 완료: ${successCount}/${totalCount} 컨트랙트 성공`,
      },
    });
  } catch (error) {
    logger.error("통합 소유권 이전 실패", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer all ownership",
    });
  }
};
