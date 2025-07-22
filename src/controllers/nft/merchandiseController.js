const {
  web3,
  merchandiseFactoryContract,
  dpTokenContract,
  creatorSBTContract,
  platformRegistryContract,
} = require("../../config/web3");
const { uploadFileToIPFS, uploadJSONToIPFS } = require("../../services/upload");
const walletService = require("../../services/wallet");
const receiptGenerator = require("../../utils/receiptGenerator");
const pdfReceiptGenerator = require("../../utils/pdfReceiptGenerator");
const logger = require("../../utils/logger");
const { stringifyBigInts } = require("../../utils/utils");
const mpcService = require("../../services/blockchainMPC");
const axios = require("axios");

/**
 * 프로젝트의 실제 분배 데이터를 계산하는 함수
 * @param {string} projectId - 프로젝트 ID
 * @param {string} totalAmount - 총 판매 금액 (Wei)
 * @returns {Array} 분배 데이터 배열
 */
const calculateDistributionData = async (projectId, totalAmount) => {
  try {
    const distributionData = [];
    const totalAmountWei = BigInt(totalAmount);
    const totalAmountDP = web3.utils.fromWei(totalAmount, "ether");

    logger.info(
      `[calculateDistributionData] 총 금액: ${totalAmountWei} Wei (${totalAmountDP} DP)`
    );

    // 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    // IPNFT 컨트랙트 주소 (MerchandiseFactory에서 참조)
    const ipnftContractAddress = await merchandiseFactoryContract.methods
      .ipnftContract()
      .call();

    // IPNFT 컨트랙트 ABI (실제 ABI 사용)
    const ipnftAbi = require("../../abi/IPNFT.json");

    const ipnftContract = new web3.eth.Contract(ipnftAbi, ipnftContractAddress);

    // 플랫폼 수수료 비율 조회
    const platformFeePercentage = await merchandiseFactoryContract.methods
      .platformFeePercentage()
      .call();

    logger.info(
      `[calculateDistributionData] 플랫폼 수수료 비율: ${platformFeePercentage} basis points`
    );

    // 브랜드 IPNFT 정보 조회
    const brandTokenId = projectInfo._brandIPNFTTokenId;
    logger.info(`[calculateDistributionData] 브랜드 토큰 ID: ${brandTokenId}`);

    const brandInfo = await ipnftContract.methods
      .getTokenInfo(brandTokenId)
      .call();
    const brandPrice = BigInt(brandInfo.price || "0");
    const brandOwner = brandInfo.owner;

    logger.info(
      `[calculateDistributionData] 브랜드 정보: price=${brandPrice}, owner=${brandOwner}`
    );

    // 브랜드 분배 계산
    if (
      brandPrice > 0 &&
      brandOwner !== "0x0000000000000000000000000000000000000000"
    ) {
      const brandFee =
        (brandPrice * BigInt(platformFeePercentage)) / BigInt(10000);
      const brandNet = brandPrice - brandFee;

      const brandPriceDP = web3.utils.fromWei(brandPrice.toString(), "ether");
      const brandFeeDP = web3.utils.fromWei(brandFee.toString(), "ether");
      const brandNetDP = web3.utils.fromWei(brandNet.toString(), "ether");

      distributionData.push({
        role: "Brand Owner",
        recipient: brandOwner,
        expectedAmount: brandPriceDP,
        fee: brandFeeDP,
        netAmount: brandNetDP,
        beforeBalance: "0", // 실제 잔액은 별도 조회 필요
        afterBalance: "0",
        actualIncrease: brandNetDP,
        isMatched: true,
      });

      // 플랫폼 수수료 (브랜드)
      distributionData.push({
        role: "Platform Fee (Brand)",
        recipient: "Platform",
        expectedAmount: brandFeeDP,
        fee: brandFeeDP,
        netAmount: brandFeeDP,
        beforeBalance: "0",
        afterBalance: "0",
        actualIncrease: brandFeeDP,
        isMatched: true,
      });
    }

    // 아티스트 IPNFT 정보 조회 및 분배 계산
    const artistTokenIds = projectInfo._artistIPNFTTokenIds;
    let artistTotalPrice = BigInt(0);

    logger.info(
      `[calculateDistributionData] 아티스트 토큰 수: ${artistTokenIds.length}`
    );

    for (let i = 0; i < artistTokenIds.length; i++) {
      const artistTokenId = artistTokenIds[i];
      logger.info(
        `[calculateDistributionData] 아티스트 ${
          i + 1
        } 토큰 ID: ${artistTokenId}`
      );

      const artistInfo = await ipnftContract.methods
        .getTokenInfo(artistTokenId)
        .call();
      const artistPrice = BigInt(artistInfo.price || "0");
      const artistOwner = artistInfo.owner;

      logger.info(
        `[calculateDistributionData] 아티스트 ${
          i + 1
        } 정보: price=${artistPrice}, owner=${artistOwner}`
      );

      artistTotalPrice += artistPrice;

      if (
        artistPrice > 0 &&
        artistOwner !== "0x0000000000000000000000000000000000000000"
      ) {
        const artistFee =
          (artistPrice * BigInt(platformFeePercentage)) / BigInt(10000);
        const artistNet = artistPrice - artistFee;

        const artistPriceDP = web3.utils.fromWei(
          artistPrice.toString(),
          "ether"
        );
        const artistFeeDP = web3.utils.fromWei(artistFee.toString(), "ether");
        const artistNetDP = web3.utils.fromWei(artistNet.toString(), "ether");

        distributionData.push({
          role: `Artist ${i + 1}`,
          recipient: artistOwner,
          expectedAmount: artistPriceDP,
          fee: artistFeeDP,
          netAmount: artistNetDP,
          beforeBalance: "0",
          afterBalance: "0",
          actualIncrease: artistNetDP,
          isMatched: true,
        });

        // 플랫폼 수수료 (아티스트)
        distributionData.push({
          role: `Platform Fee (Artist ${i + 1})`,
          recipient: "Platform",
          expectedAmount: artistFeeDP,
          fee: artistFeeDP,
          netAmount: artistFeeDP,
          beforeBalance: "0",
          afterBalance: "0",
          actualIncrease: artistFeeDP,
          isMatched: true,
        });
      }
    }

    // 인플루언서 마진 계산
    const royaltiesTotal = brandPrice + artistTotalPrice;

    logger.info(
      `[calculateDistributionData] 로열티 총합: ${royaltiesTotal} Wei`
    );
    logger.info(`[calculateDistributionData] 총 판매액: ${totalAmountWei} Wei`);

    const influencerMargin =
      totalAmountWei > royaltiesTotal
        ? totalAmountWei - royaltiesTotal
        : BigInt(0);

    logger.info(
      `[calculateDistributionData] 인플루언서 마진: ${influencerMargin} Wei`
    );

    if (influencerMargin > 0) {
      const influencerFee =
        (influencerMargin * BigInt(platformFeePercentage)) / BigInt(10000);
      const influencerNet = influencerMargin - influencerFee;

      logger.info(
        `[calculateDistributionData] 인플루언서 수수료: ${influencerFee} Wei`
      );
      logger.info(
        `[calculateDistributionData] 인플루언서 순수익: ${influencerNet} Wei`
      );

      const influencerMarginDP = web3.utils.fromWei(
        influencerMargin.toString(),
        "ether"
      );
      const influencerFeeDP = web3.utils.fromWei(
        influencerFee.toString(),
        "ether"
      );
      const influencerNetDP = web3.utils.fromWei(
        influencerNet.toString(),
        "ether"
      );

      distributionData.push({
        role: "Influencer",
        recipient: projectInfo._influencer,
        expectedAmount: influencerMarginDP,
        fee: influencerFeeDP,
        netAmount: influencerNetDP,
        beforeBalance: "0",
        afterBalance: "0",
        actualIncrease: influencerNetDP,
        isMatched: true,
      });

      // 플랫폼 수수료 (인플루언서)
      distributionData.push({
        role: "Platform Fee (Influencer)",
        recipient: "Platform",
        expectedAmount: influencerFeeDP,
        fee: influencerFeeDP,
        netAmount: influencerFeeDP,
        beforeBalance: "0",
        afterBalance: "0",
        actualIncrease: influencerFeeDP,
        isMatched: true,
      });
    }

    logger.info(
      `[calculateDistributionData] 분배 데이터 계산 완료: ${distributionData.length}개 항목`
    );
    return distributionData;
  } catch (error) {
    logger.error(`분배 데이터 계산 중 오류: ${error.message}`);
    logger.error(`오류 상세 정보:`, error);
    // 오류 발생 시 기본 분배 데이터 반환
    return [
      {
        role: "Platform Fee",
        recipient: "Platform",
        expectedAmount: "0",
        fee: "0",
        netAmount: "0",
        beforeBalance: "0",
        afterBalance: "0",
        actualIncrease: "0",
        isMatched: true,
      },
    ];
  }
};

// =============================================
// 1. 프로젝트 관리 (인플루언서, 브랜드)
// =============================================

/**
 * Merchandise 프로젝트 생성 (인플루언서)
 * @param {Object} req - Express request object
 * @param {string} req.body.projectName - 프로젝트 이름
 * @param {string} req.body.description - 프로젝트 설명
 * @param {number} req.body.quantity - 수량
 * @param {string} req.body.salePrice - 판매 가격
 * @param {string} req.body.ipnftTokenIds - IPNFT 토큰 ID들
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {string} req.body.projectImageUrl - 프로젝트 이미지 URL
 * @param {Object} res - Express response object
 */
const createProject = async (req, res) => {
  const {
    projectName,
    description,
    quantity,
    salePrice,
    ipnftTokenIds,
    storedWalletData,
    devicePassword,
    projectImageUrl,
  } = req.body;
  const accessToken = req.token; // 미들웨어에서 주입된 토큰 사용

  try {
    // 1. 필수 파라미터 검증
    if (
      !projectName ||
      !description ||
      quantity === undefined ||
      quantity === null ||
      !salePrice ||
      !ipnftTokenIds ||
      !devicePassword ||
      !storedWalletData
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    // 2. 프로젝트 이미지 처리
    let projectImageUri = "";

    if (projectImageUrl) {
      // URL에서 이미지 다운로드 후 업로드
      if (
        !projectImageUrl.startsWith("http://") &&
        !projectImageUrl.startsWith("https://")
      ) {
        return res.status(400).json({
          success: false,
          message: "잘못된 이미지 URL 형식입니다.",
        });
      }

      try {
        const response = await axios.get(projectImageUrl, {
          responseType: "arraybuffer",
        });
        const buffer = Buffer.from(response.data, "binary");
        const filename =
          new URL(projectImageUrl).pathname.split("/").pop() || "image.png";
        projectImageUri = await uploadFileToIPFS(buffer, filename);
      } catch (err) {
        logger.error("Failed to download or upload image from URL:", err);
        return res.status(500).json({
          success: false,
          message: "URL에서 이미지를 처리하는 데 실패했습니다.",
        });
      }
    } else if (req.files && req.files.length > 0) {
      // 파일 업로드 방식
      try {
        const file = req.files[0];
        projectImageUri = await uploadFileToIPFS(
          file.buffer,
          file.originalname
        );
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: "IPFS upload failed",
        });
      }
    }

    if (!projectImageUri) {
      return res.status(400).json({
        success: false,
        message: "프로젝트 이미지가 필요합니다 (URL 또는 파일 업로드).",
      });
    }

    // 3. IPNFT 토큰 ID 파싱
    const tokenIdsArray = String(ipnftTokenIds)
      .split(",")
      .map((id) => id.trim());

    // 4. IPNFT 컨트랙트 인스턴스 생성
    const ipnftFactoryContract = new web3.eth.Contract(
      require("../../abi/IPNFTFactory.json"),
      await platformRegistryContract.methods.ipnftFactory().call()
    );
    const ipnftAddress = await ipnftFactoryContract.methods
      .getIPNFTAddress()
      .call();
    const ipnftContract = new web3.eth.Contract(
      require("../../abi/IPNFT.json"),
      ipnftAddress
    );

    let brandIPNFTTokenId = null;
    let artistIPNFTTokenIds = [];
    let minSalePriceInWei = BigInt(0);

    for (const tokenId of tokenIdsArray) {
      logger.info(
        `[Create Project] Manually validating IPNFT Token ID: ${tokenId}`
      );

      try {
        // 1. PlatformRegistry에 등록되었는지 확인
        const isRegistered = await platformRegistryContract.methods
          .validIPNFTTokenIds(tokenId)
          .call();
        if (!isRegistered) {
          throw new Error(
            `Token ID ${tokenId} is not registered in PlatformRegistry.`
          );
        }
        logger.info(`> Token ${tokenId} is registered.`);

        // 2. IPNFT 정보 가져오기
        const ipnftInfo = await ipnftContract.methods
          .getTokenInfo(tokenId)
          .call();
        minSalePriceInWei += BigInt(ipnftInfo.price);
        logger.info(`> Fetched IPNFT info for ${tokenId}:`, {
          creator: ipnftInfo.creator,
          sbtId: ipnftInfo.creatorSBTId,
        });

        // 3. SBT 정보 가져오기
        const sbtInfo = await creatorSBTContract.methods
          .getSBTInfoById(ipnftInfo.creatorSBTId)
          .call();
        logger.info(
          `> Fetched SBT info for SBT ID ${ipnftInfo.creatorSBTId}:`,
          { type: sbtInfo.creatorType }
        );

        // 4. 타입 검증
        const isBrand = sbtInfo.creatorType.toLowerCase() === "brand";
        const isArtist = sbtInfo.creatorType.toLowerCase() === "artist";

        logger.info(
          `> Validation result for ${tokenId}: isBrand=${isBrand}, isArtist=${isArtist}`
        );

        if (!isBrand && !isArtist) {
          return res.status(400).json({
            success: false,
            message: `IPNFT Token ID ${tokenId} is not a valid brand/artist IPNFT.`,
          });
        }

        if (isBrand) {
          if (brandIPNFTTokenId !== null) {
            return res.status(400).json({
              success: false,
              message: "Only one brand IPNFT can be specified.",
            });
          }
          brandIPNFTTokenId = tokenId;
        } else if (isArtist) {
          artistIPNFTTokenIds.push(tokenId);
        }
      } catch (err) {
        logger.error(
          `[Create Project] Validation failed for token ${tokenId}: ${err.message}`
        );
        return res.status(500).json({
          success: false,
          message: `Error validating IPNFT Token ID ${tokenId}.`,
          error: err.message,
        });
      }
    }

    if (brandIPNFTTokenId === null) {
      return res.status(400).json({
        success: false,
        message: "One brand IPNFT must be specified.",
      });
    }
    if (artistIPNFTTokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one artist IPNFT must be specified.",
      });
    }

    const salePriceInWei = BigInt(web3.utils.toWei(String(salePrice), "ether"));

    if (salePriceInWei < minSalePriceInWei) {
      return res.status(400).json({
        success: false,
        message: `판매 가격은 모든 IPNFT 판매가의 합보다 낮을 수 없습니다. 최소 판매가: ${web3.utils.fromWei(
          minSalePriceInWei.toString(),
          "ether"
        )} DP`,
      });
    }

    // 최종 파라미터 로깅
    logger.info(
      "[Create Project] Final parameters for smart contract transaction:"
    );
    logger.info(`> projectName: ${projectName} (${typeof projectName})`);
    logger.info(`> description: ${description} (${typeof description})`);
    logger.info(`> quantity: ${quantity} (${typeof quantity})`);
    logger.info(
      `> salePriceInWei: ${salePriceInWei.toString()} (${typeof salePriceInWei})`
    );
    logger.info(
      `> brandIPNFTTokenId: ${brandIPNFTTokenId} (${typeof brandIPNFTTokenId})`
    );
    logger.info(
      `> artistIPNFTTokenIds: ${JSON.stringify(
        artistIPNFTTokenIds
      )} (Array of ${typeof artistIPNFTTokenIds[0]})`
    );
    logger.info(
      `> projectImageUri: ${projectImageUri} (${typeof projectImageUri})`
    );

    // 여기서 salePriceInWei는 이미 BigInt 타입이므로 그대로 사용
    const createProjectTxData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .createMerchandiseProject(
          projectName,
          description,
          quantity,
          salePriceInWei.toString(), // 스마트 컨트랙트 함수는 BigInt를 직접 받지 못하므로 문자열로 변환
          brandIPNFTTokenId, // 문자열 ID 전달
          artistIPNFTTokenIds, // 문자열 ID 배열 전달
          projectImageUri
        )
        .encodeABI(),
      value: "0",
    };

    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      createProjectTxData,
      accessToken
    );

    let projectId = null;
    try {
      const eventAbi = merchandiseFactoryContract.options.jsonInterface.find(
        (e) => e.name === "MerchandiseProjectCreated" && e.type === "event"
      );

      if (eventAbi) {
        const eventLog = receipt.logs.find(
          (log) =>
            log.address.toLowerCase() ===
              merchandiseFactoryContract.options.address.toLowerCase() &&
            log.topics[0] === eventAbi.signature
        );

        if (eventLog) {
          const decodedLog = web3.eth.abi.decodeLog(
            eventAbi.inputs,
            eventLog.data,
            eventLog.topics.slice(1)
          );
          projectId = decodedLog.projectId.toString();
        } else {
          logger.warn(
            `[Create Project] MerchandiseProjectCreated event not found in transaction ${receipt.transactionHash}`
          );
        }
      } else {
        logger.warn(
          `[Create Project] MerchandiseProjectCreated event ABI not found.`
        );
      }
    } catch (err) {
      logger.error(`[Create Project] Error parsing event log: ${err.message}`);
    }

    return res.json({
      success: true,
      message: "Merchandise project created successfully.",
      txHash: receipt.transactionHash,
      projectId: projectId,
    });
  } catch (error) {
    logger.error("Error creating merchandise project:", error);
    logger.error("Full error object:", JSON.stringify(error, null, 2));

    // 장치 비밀번호 검증 실패 에러 처리
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "An error occurred while creating the project.",
    });
  }
};

/**
 * 프로젝트 활성화 (브랜드)
 * @param {Object} req - Express request object
 * @param {string} req.body.projectId - 프로젝트 ID
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
const setActive = async (req, res) => {
  const { projectId, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (!projectId || !devicePassword || !storedWalletData) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    const txData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .activateProject(projectId)
        .encodeABI(),
      value: "0",
    };

    // 비밀번호를 검증하는 안전한 MPC 서비스로 변경
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    return res.json({
      success: true,
      message: "프로젝트가 성공적으로 활성화되었습니다.",
      receipt: stringifyBigInts(receipt),
    });
  } catch (error) {
    logger.error("Error activating project:", error);

    // 장치 비밀번호 검증 실패 에러 처리
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    const reason =
      error.reason ||
      (error.data ? web3.utils.toAscii(error.data) : null) ||
      error.message;
    logger.error(`Project activation failed. Reason: ${reason}`);

    return res.status(500).json({
      success: false,
      message: "프로젝트 활성화 중 오류가 발생했습니다.",
      error: reason,
    });
  }
};

// =============================================
// 2. 구매 플로우 (구매자)
// =============================================

/**
 * 상품 구매 요청 (Approve & Request)
 * @param {Object} req - Express request object
 * @param {string} req.body.projectId - 프로젝트 ID
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
const requestPurchase = async (req, res) => {
  const { projectId, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (
    projectId === undefined ||
    projectId === null ||
    !devicePassword ||
    !storedWalletData
  ) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID, 장치 비밀번호, 지갑 데이터는 필수입니다.",
    });
  }

  try {
    // 1. 스마트 컨트랙트에서 프로젝트의 정확한 판매 가격(salePrice)을 조회합니다.
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();
    const salePriceInWei = projectInfo._salePrice;

    if (!projectInfo._isActive) {
      return res.status(400).json({
        success: false,
        message: "아직 활성화되지 않은 프로젝트입니다.",
      });
    }

    if (projectInfo._mintedCount >= projectInfo._totalSupply) {
      return res
        .status(400)
        .json({ success: false, message: "모든 수량이 판매되었습니다." });
    }

    const userWalletAddress = storedWalletData.sid;
    const dpBalance = await dpTokenContract.methods
      .balanceOf(userWalletAddress)
      .call();

    // 2. 사용자의 DP 토큰 잔액을 확인합니다.
    if (BigInt(dpBalance) < BigInt(salePriceInWei)) {
      return res.status(403).json({
        success: false,
        message: `DP 토큰 잔액이 부족합니다. 필요 금액: ${web3.utils.fromWei(
          salePriceInWei,
          "ether"
        )} DP`,
      });
    }

    // 3. 정확한 salePrice로 DP 토큰 사용을 승인(approve)합니다.
    const approveTxData = {
      to: dpTokenContract.options.address,
      data: dpTokenContract.methods
        .approve(merchandiseFactoryContract.options.address, salePriceInWei)
        .encodeABI(),
      value: "0",
    };

    const approveReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      approveTxData,
      accessToken
    );
    logger.info(
      `[Purchase] DP Token approved for ${web3.utils.fromWei(
        salePriceInWei,
        "ether"
      )} DP. Tx Hash: ${approveReceipt.transactionHash}`
    );

    // 4. 구매 요청(requestPurchase) 트랜잭션을 실행합니다.
    const purchaseTxData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .requestPurchase(projectId)
        .encodeABI(), // 함수 이름 수정 및 quantity 제거
      value: "0",
    };

    const purchaseReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      purchaseTxData,
      accessToken
    );

    if (!purchaseReceipt) {
      throw new Error("구매 요청 트랜잭션 실패");
    }

    const txHash = purchaseReceipt.transactionHash;
    let requestId = null;

    // 이벤트 로그에서 requestId를 추출합니다.
    try {
      const eventAbi = merchandiseFactoryContract.options.jsonInterface.find(
        (e) => e.name === "PurchaseRequestCreated" && e.type === "event"
      );

      if (eventAbi) {
        const eventLog = purchaseReceipt.logs.find(
          (log) =>
            log.address.toLowerCase() ===
              merchandiseFactoryContract.options.address.toLowerCase() &&
            log.topics[0] === eventAbi.signature
        );

        if (eventLog) {
          const decodedLog = web3.eth.abi.decodeLog(
            eventAbi.inputs,
            eventLog.data,
            eventLog.topics.slice(1)
          );
          requestId = decodedLog.requestId.toString();
        } else {
          logger.warn(
            `[Purchase] 트랜잭션 ${txHash}에서 PurchaseRequestCreated 이벤트를 찾을 수 없습니다.`
          );
        }
      } else {
        logger.warn(
          `[Purchase] PurchaseRequestCreated 이벤트의 ABI를 찾을 수 없습니다.`
        );
      }
    } catch (error) {
      logger.error(
        `[Purchase] 이벤트 로그 처리 중 오류 발생: ${error.message}`
      );
    }

    res.status(200).json({
      success: true,
      message: "구매 요청이 성공적으로 완료되었습니다.",
      requestId: requestId,
      txHash: txHash,
    });
  } catch (error) {
    logger.error(`구매 요청 처리 중 오류: ${error.message}`);

    // 장치 비밀번호 검증 실패 에러 처리
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: "구매 요청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * 상품 구매 확정 (NFT 발행 및 대금 정산, NFT별 고유 메타데이터 세팅)
 * @param {Object} req - Express request object
 * @param {string} req.body.projectId - 프로젝트 ID
 * @param {string} req.body.requestId - 요청 ID
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
const confirmPurchase = async (req, res) => {
  const { projectId, requestId, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (
    projectId === undefined ||
    projectId === null ||
    requestId === undefined ||
    requestId === null ||
    !devicePassword ||
    !storedWalletData
  ) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    // 1. 구매자/프로젝트 정보 조회
    const userWalletAddress = storedWalletData.sid;
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();
    const purchaseRequest = await merchandiseFactoryContract.methods
      .getPurchaseRequest(projectId, requestId)
      .call();

    // 2. 고유 메타데이터(JSON) 생성
    const metadata = {
      name: `${projectInfo._projectName} #${requestId}`,
      description: projectInfo._productDescription,
      image:
        projectInfo._projectImageURI &&
        projectInfo._projectImageURI.startsWith("ipfs://")
          ? projectInfo._projectImageURI.replace(
              "ipfs://",
              "https://ipfs.io/ipfs/"
            )
          : projectInfo._projectImageURI,
      attributes: [
        { trait_type: "Project ID", value: String(projectId) },
        { trait_type: "Request ID", value: String(requestId) },
        { trait_type: "Buyer", value: userWalletAddress },
        {
          trait_type: "Sale Price",
          value: projectInfo._salePrice
            ? projectInfo._salePrice.toString()
            : "",
        },
        { trait_type: "Created At", value: new Date().toISOString() },
      ],
    };

    // 3. 메타데이터를 IPFS에 업로드
    let tokenUri;
    try {
      tokenUri = await uploadJSONToIPFS(metadata); // ipfs://... 형식
    } catch (err) {
      logger.error("[ConfirmPurchase] IPFS 업로드 실패:", err);
      return res.status(500).json({
        success: false,
        message: "NFT 메타데이터 업로드에 실패했습니다.",
      });
    }

    // 4. 구매확정+tokenURI 트랜잭션 생성
    const confirmTxData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .confirmPurchase(projectId, requestId, tokenUri)
        .encodeABI(),
      value: "0",
    };

    // 5. MPC 서명 및 전송
    logger.info(`[ConfirmPurchase] Confirming purchase with tokenURI...`);
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      confirmTxData,
      accessToken
    );

    // 6. 결과 파싱 (tokenId 추출)
    let tokenId = null;
    try {
      const eventAbi = merchandiseFactoryContract.options.jsonInterface.find(
        (e) => e.name === "PurchaseConfirmed" && e.type === "event"
      );
      if (eventAbi) {
        const eventLog = receipt.logs.find(
          (log) =>
            log.address.toLowerCase() ===
              merchandiseFactoryContract.options.address.toLowerCase() &&
            log.topics[0] === eventAbi.signature
        );
        if (eventLog) {
          const decodedLog = web3.eth.abi.decodeLog(
            eventAbi.inputs,
            eventLog.data,
            eventLog.topics.slice(1)
          );
          tokenId = decodedLog.tokenId.toString();
        }
      }
    } catch (err) {
      logger.error("[ConfirmPurchase] tokenId 파싱 실패:", err);
    }

    return res.json({
      success: true,
      message: "구매가 성공적으로 확정되었습니다.",
      txHash: receipt.transactionHash,
      tokenId: tokenId,
      tokenUri: tokenUri,
    });
  } catch (error) {
    logger.error("[ConfirmPurchase] Error:", error);
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }
    return res.status(500).json({
      success: false,
      message: "구매 확정 중 오류가 발생했습니다.",
    });
  }
};

/**
 * 상품 구매 취소
 * @param {Object} req - Express request object
 * @param {string} req.body.projectId - 프로젝트 ID
 * @param {string} req.body.requestId - 요청 ID
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
const cancelPurchase = async (req, res) => {
  const { projectId, requestId, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (
    projectId === undefined ||
    projectId === null ||
    requestId === undefined ||
    requestId === null ||
    !devicePassword ||
    !storedWalletData
  ) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    // 트랜잭션 생성
    const cancelTxData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .cancelPurchase(projectId, requestId)
        .encodeABI(),
      value: "0",
    };

    // MPC 서명 및 전송
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      cancelTxData,
      accessToken
    );

    return res.json({
      success: true,
      message: "구매가 성공적으로 취소되었습니다.",
      txHash: receipt.transactionHash,
    });
  } catch (error) {
    logger.error("Error canceling purchase:", error);

    // 장치 비밀번호 검증 실패 에러 처리
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: "구매 취소 중 오류가 발생했습니다.",
    });
  }
};

// =============================================
// 3. 조회 API
// =============================================

// 3.1. 프로젝트 조회
// ---------------------------------------------

const _formatProjectInfo = async (projectId, projectInfo) => {
  // 새로 추가한 함수를 호출하여 아티스트 토큰 ID 목록을 가져옵니다.
  const artistIdsRaw = await merchandiseFactoryContract.methods
    .getArtistIPNFTTokenIdsForProject(projectId)
    .call();
  const artistIds = (artistIdsRaw || []).map((id) => id.toString());

  // IPFS 이미지 URI 변환
  let projectImageURI = projectInfo.projectImageURI;
  if (projectImageURI && projectImageURI.startsWith("ipfs://")) {
    projectImageURI = projectImageURI.replace(
      "ipfs://",
      "https://ipfs.io/ipfs/"
    );
  }

  return {
    projectId: projectId.toString(),
    influencer: projectInfo.influencer,
    projectName: projectInfo.projectName,
    productDescription: projectInfo.productDescription,
    brandIPNFTTokenId: projectInfo.brandIPNFTTokenId.toString(),
    artistIPNFTTokenIds: artistIds,
    totalSupply: projectInfo.totalSupply.toString(),
    salePrice: web3.utils.fromWei(projectInfo.salePrice.toString(), "ether"),
    isActive: projectInfo.isActive,
    createdAt: projectInfo.createdAt.toString(),
    projectImageURI: projectImageURI,
    mintedCount: projectInfo.mintedCount.toString(),
  };
};

/**
 * 전체 Merchandise 프로젝트 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllProjects = async (req, res) => {
  try {
    const projectCount = await merchandiseFactoryContract.methods
      .nextProjectId()
      .call();
    const projectPromises = [];

    for (let i = 0; i < projectCount; i++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .projects(i)
          .call()
          .then((projectInfo) => {
            if (
              projectInfo.influencer !==
              "0x0000000000000000000000000000000000000000"
            ) {
              return _formatProjectInfo(i, projectInfo); // This returns a promise
            }
            return null;
          })
          .catch((error) => {
            logger.error(`Error fetching project ${i}:`, error);
            return null;
          })
      );
    }

    // Promise.all로 모든 약속(Promise)이 이행될 때까지 기다립니다.
    const projects = (await Promise.all(projectPromises)).filter(
      (p) => p !== null
    );
    res.json({ success: true, data: stringifyBigInts(projects.reverse()) });
  } catch (error) {
    logger.error("Error fetching all merchandise projects:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve merchandise projects.",
      error: error.message,
    });
  }
};

/**
 * 인플루언서 자신의 프로젝트 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMyProjects = async (req, res) => {
  try {
    const walletInfo = await walletService.getWallet(req.token);
    const walletAddress = walletInfo.address;

    if (!walletAddress) {
      return res.status(401).json({
        success: false,
        message: "No wallet address found from accessToken.",
      });
    }

    const projectCount = await merchandiseFactoryContract.methods
      .nextProjectId()
      .call();
    const projectPromises = [];

    for (let i = 0; i < projectCount; i++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .projects(i)
          .call()
          .then((projectInfo) => {
            if (
              projectInfo &&
              projectInfo.influencer &&
              projectInfo.influencer.toLowerCase() ===
                walletAddress.toLowerCase()
            ) {
              return _formatProjectInfo(i, projectInfo); // This returns a promise
            }
            return null;
          })
          .catch((error) => {
            logger.error(
              `Error fetching project info for my project ${i}:`,
              error
            );
            return null;
          })
      );
    }

    // Promise.all로 모든 약속(Promise)이 이행될 때까지 기다립니다.
    const myProjects = (await Promise.all(projectPromises)).filter(
      (p) => p !== null
    );

    return res.json({
      success: true,
      message: "My merchandise projects retrieved successfully",
      data: stringifyBigInts(myProjects.reverse()),
    });
  } catch (error) {
    logger.error("My merchandise projects retrieval error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve my merchandise projects",
      error: error.message,
    });
  }
};

/**
 * 브랜드가 활성화해야 할 프로젝트 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBrandPendingProjects = async (req, res) => {
  try {
    const walletInfo = await walletService.getWallet(req.token);
    const myAddress = walletInfo.address.toLowerCase();

    // 1. 전체 프로젝트 수 조회
    const projectCount = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    const result = [];

    // 2. 모든 프로젝트를 순회하며 브랜드 소유자의 비활성화된 프로젝트 찾기
    for (let i = 0; i < projectCount; i++) {
      try {
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(i)
          .call();

        // 프로젝트가 존재하고 비활성화 상태인지 확인
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          console.log(
            `[brand-pending] projectId=${i} : influencer 없음, 건너뜀`
          );
          continue; // 프로젝트가 존재하지 않음
        }

        if (projectInfo._isActive) {
          console.log(`[brand-pending] projectId=${i} : 이미 활성화됨, 건너뜀`);
          continue; // 이미 활성화된 프로젝트
        }

        // 브랜드 IPNFT 토큰 ID 확인 (0도 유효한 토큰 ID로 처리)
        const brandIPNFTTokenId = projectInfo._brandIPNFTTokenId;
        console.log(
          `[brand-pending] projectId=${i} : brandIPNFTTokenId=${brandIPNFTTokenId}`
        );

        // IPNFT 컨트랙트에서 브랜드 소유자 확인
        const ipnftFactoryAddr = await platformRegistryContract.methods
          .ipnftFactory()
          .call();
        const ipnftFactory = new web3.eth.Contract( // 여기는 동적으로 생성해야 할 수 있으므로 유지
          require("../../abi/IPNFTFactory.json"),
          ipnftFactoryAddr
        );
        const ipnftContractAddress = await ipnftFactory.methods
          .getIPNFTAddress()
          .call();

        const ipnftContract = new web3.eth.Contract(
          require("../../abi/IPNFT.json"),
          ipnftContractAddress
        );

        const brandOwner = await ipnftContract.methods
          .ownerOf(brandIPNFTTokenId)
          .call();

        console.log(
          `[brand-pending] projectId=${i} | brandIPNFTTokenId=${brandIPNFTTokenId} | brandOwner=${brandOwner} | myAddress=${myAddress} | isActive=${projectInfo._isActive}`
        );

        if (brandOwner.toLowerCase() === myAddress) {
          console.log(
            `[brand-pending] projectId=${i} : 내 브랜드 프로젝트로 추가!`
          );
          result.push({
            projectId: i,
            influencer: projectInfo._influencer,
            projectName: projectInfo._projectName,
            brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
            artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
            totalSupply: projectInfo._totalSupply,
            salePrice: web3.utils.fromWei(
              projectInfo._salePrice || "0",
              "ether"
            ),
            isActive: projectInfo._isActive,
            createdAt: projectInfo._createdAt,
            projectImageURI:
              projectInfo._projectImageURI &&
              projectInfo._projectImageURI.startsWith("ipfs://")
                ? projectInfo._projectImageURI.replace(
                    "ipfs://",
                    "https://ipfs.io/ipfs/"
                  )
                : projectInfo._projectImageURI,
            mintedCount: projectInfo._mintedCount,
          });
        } else {
          console.log(
            `[brand-pending] projectId=${i} : 브랜드 소유자 불일치, 건너뜀`
          );
        }
      } catch (e) {
        console.error(`프로젝트 ${i} 조회 실패:`, e);
        // 개별 프로젝트 오류 무시하고 계속 진행
      }
    }

    return res.json({
      success: true,
      data: stringifyBigInts(result),
      totalCount: result.length,
    });
  } catch (error) {
    console.error("브랜드 서명 대기 프로젝트 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "브랜드 서명 대기 프로젝트 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 3.2. 구매 요청 조회
// ---------------------------------------------

/**
 * @summary 특정 구매 요청 정보 조회
 */
const getPurchaseRequest = async (req, res) => {
  const { projectId, requestId } = req.params;

  if (!projectId || requestId === undefined) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID와 요청 ID가 필요합니다.",
    });
  }

  // projectId와 requestId를 숫자로 변환
  const numericProjectId = parseInt(projectId, 10);
  const numericRequestId = parseInt(requestId, 10);

  if (isNaN(numericProjectId) || isNaN(numericRequestId)) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID와 요청 ID는 숫자여야 합니다.",
    });
  }

  try {
    const purchaseRequest = await merchandiseFactoryContract.methods
      .getPurchaseRequest(numericProjectId, numericRequestId)
      .call();

    if (
      !purchaseRequest.buyer ||
      purchaseRequest.buyer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "구매 요청을 찾을 수 없습니다.",
      });
    }

    res.json({
      success: true,
      data: {
        projectId: numericProjectId,
        requestId: numericRequestId,
        buyer: purchaseRequest.buyer,
        amount: web3.utils.fromWei(purchaseRequest.amount || "0", "ether"),
        timestamp: purchaseRequest.timestamp.toString(),
        isConfirmed: purchaseRequest.isConfirmed,
        isCancelled: purchaseRequest.isCancelled,
        tokenId: purchaseRequest.tokenId.toString(),
      },
    });
  } catch (error) {
    logger.error("구매 요청 정보 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "구매 요청 정보 조회 중 오류가 발생했습니다.",
      message: errorMessage,
      error: error.message,
    });
  }
};

/**
 * @summary 프로젝트별 전체 구매 요청 목록 조회
 */
const getProjectPurchaseRequests = async (req, res) => {
  const { projectId } = req.params;

  if (projectId === undefined || projectId === null) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID를 입력해주세요.",
    });
  }

  // projectId가 문자열 ":projectId"인지 확인
  if (projectId === ":projectId") {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 프로젝트 ID입니다.",
    });
  }

  // projectId를 숫자로 변환
  const numericProjectId = parseInt(projectId, 10);
  if (isNaN(numericProjectId)) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID는 숫자여야 합니다.",
    });
  }

  logger.info(
    `[getProjectPurchaseRequests] 프로젝트 ${numericProjectId} 구매 요청 목록 조회 시작`
  );

  try {
    // 전체 프로젝트 수 확인
    const totalProjectCount = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    logger.info(
      `[getProjectPurchaseRequests] 전체 프로젝트 수: ${totalProjectCount.toString()}`
    );

    // 프로젝트 ID 유효성 검사
    if (numericProjectId >= totalProjectCount) {
      return res.status(400).json({
        success: false,
        message: `프로젝트 ID ${numericProjectId}는 존재하지 않습니다. (전체 프로젝트 수: ${totalProjectCount})`,
      });
    }

    // 프로젝트 정보 조회
    logger.info(`[getProjectPurchaseRequests] 프로젝트 정보 조회 중...`);
    logger.info(
      `[getProjectPurchaseRequests] 프로젝트 ID: ${numericProjectId}`
    );
    logger.info(
      `[getProjectPurchaseRequests] 컨트랙트 주소: ${merchandiseFactoryContract.options.address}`
    );

    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(numericProjectId)
      .call();

    logger.info(`[getProjectPurchaseRequests] 프로젝트 정보:`, {
      influencer: projectInfo._influencer,
      projectName: projectInfo._projectName,
      isActive: projectInfo._isActive,
    });

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: `프로젝트 ID ${numericProjectId}는 존재하지 않거나 유효하지 않습니다.`,
      });
    }

    // 해당 프로젝트의 구매 요청 수 조회 (nextRequestId 사용)
    logger.info(`[getProjectPurchaseRequests] 총 요청 수 조회 중...`);
    let totalRequests;
    try {
      totalRequests = await merchandiseFactoryContract.methods
        .nextRequestId(numericProjectId)
        .call();
      logger.info(`[getProjectPurchaseRequests] 총 요청 수: ${totalRequests}`);
    } catch (error) {
      logger.error(`프로젝트 ${projectId}의 총 요청 수 조회 실패:`, error);
      logger.error(`에러 상세 정보:`, {
        projectId: numericProjectId,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      totalRequests = "0"; // 기본값 설정
    }

    const purchaseRequests = [];
    logger.info(
      `[getProjectPurchaseRequests] 구매 요청 목록 조회 시작 (총 ${totalRequests}개)`
    );

    // totalRequests가 0이면 빈 배열 반환
    if (totalRequests === "0" || totalRequests === 0) {
      logger.info(`[getProjectPurchaseRequests] 구매 요청이 없습니다.`);
      return res.json({
        success: true,
        data: {
          projectId: numericProjectId,
          projectName: projectInfo._projectName,
          projectImageURI: projectInfo._projectImageURI,
          purchaseRequests: [],
          totalCount: 0,
        },
      });
    }

    for (let requestId = 0; requestId < totalRequests; requestId++) {
      try {
        logger.info(
          `[getProjectPurchaseRequests] 요청 ID ${requestId} 조회 중...`
        );
        const purchaseRequest = await merchandiseFactoryContract.methods
          .getPurchaseRequest(numericProjectId, requestId)
          .call();

        logger.info(
          `[getProjectPurchaseRequests] 요청 ID ${requestId} 데이터:`,
          {
            buyer: purchaseRequest.buyer,
            amount: purchaseRequest.amount,
            isConfirmed: purchaseRequest.isConfirmed,
            isCancelled: purchaseRequest.isCancelled,
          }
        );

        if (
          purchaseRequest.buyer &&
          purchaseRequest.buyer !== "0x0000000000000000000000000000000000000000"
        ) {
          purchaseRequests.push({
            requestId: requestId,
            buyer: purchaseRequest.buyer,
            amount: web3.utils.fromWei(purchaseRequest.amount || "0", "ether"),
            amountWei: purchaseRequest.amount.toString(),
            timestamp: purchaseRequest.timestamp.toString(),
            isConfirmed: purchaseRequest.isConfirmed,
            isCancelled: purchaseRequest.isCancelled,
            status: purchaseRequest.isConfirmed
              ? "confirmed"
              : purchaseRequest.isCancelled
              ? "cancelled"
              : "pending",
            tokenId: purchaseRequest.tokenId.toString(),
          });
          logger.info(
            `[getProjectPurchaseRequests] 요청 ID ${requestId} 추가됨`
          );
        } else {
          logger.info(
            `[getProjectPurchaseRequests] 요청 ID ${requestId}는 유효하지 않음`
          );
        }
      } catch (error) {
        logger.error(`요청 ID ${requestId} 조회 실패:`, error);
        logger.error(`에러 상세 정보:`, {
          projectId: numericProjectId,
          requestId: requestId,
          errorMessage: error.message,
          errorStack: error.stack,
        });
      }
    }

    return res.json({
      success: true,
      message: "프로젝트 구매 요청 목록을 성공적으로 조회했습니다.",
      data: {
        projectId: numericProjectId,
        projectName: projectInfo._projectName,
        projectImageURI: projectInfo._projectImageURI,
        purchaseRequests: purchaseRequests,
        totalCount: purchaseRequests.length,
      },
    });
  } catch (error) {
    logger.error("프로젝트 구매 요청 목록 조회 실패", error);
    logger.error("에러 상세 정보:", {
      projectId: projectId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "프로젝트 구매 요청 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * @summary 자신의 구매 요청 목록 조회
 */
const getMyPurchaseRequests = async (req, res) => {
  const accessToken = req.token;

  try {
    // 1. 사용자 정보 조회
    const walletInfo = await walletService.getWallet(accessToken);
    const buyerAddress = walletInfo.address.toLowerCase();

    console.log("[getMyPurchaseRequests] 구매자 주소:", buyerAddress);

    // 2. 전체 프로젝트 수 조회
    const projectCount = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    console.log("[getMyPurchaseRequests] 전체 프로젝트 수:", projectCount);

    const myPurchaseRequests = [];

    // 3. 모든 프로젝트의 구매 요청들을 확인
    for (let projectId = 0; projectId < projectCount; projectId++) {
      try {
        // 프로젝트 정보 조회
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call();

        // 프로젝트가 존재하지 않으면 건너뛰기
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          continue;
        }

        // 해당 프로젝트의 구매 요청 수 조회
        const totalRequests = await merchandiseFactoryContract.methods
          .projectTotalRequests(projectId)
          .call();

        console.log(
          `[getMyPurchaseRequests] 프로젝트 ${projectId}의 구매 요청 수:`,
          totalRequests
        );

        // 각 구매 요청 확인
        for (let requestId = 0; requestId < totalRequests; requestId++) {
          try {
            const purchaseRequest = await merchandiseFactoryContract.methods
              .getPurchaseRequest(projectId, requestId)
              .call();

            // 구매자가 일치하는지 확인
            if (
              purchaseRequest.buyer &&
              purchaseRequest.buyer.toLowerCase() === buyerAddress
            ) {
              myPurchaseRequests.push({
                projectId: projectId,
                requestId: requestId,
                buyer: purchaseRequest.buyer,
                amount: web3.utils.fromWei(
                  purchaseRequest.amount || "0",
                  "ether"
                ),
                amountWei: purchaseRequest.amount.toString(),
                timestamp: purchaseRequest.timestamp.toString(),
                isConfirmed: purchaseRequest.isConfirmed,
                isCancelled: purchaseRequest.isCancelled,
                status: purchaseRequest.isConfirmed
                  ? "confirmed"
                  : purchaseRequest.isCancelled
                  ? "cancelled"
                  : "pending",
                tokenId: purchaseRequest.tokenId.toString(),
              });
            }
          } catch (err) {
            console.error(
              `[getMyPurchaseRequests] 구매 요청 ${requestId} 조회 실패:`,
              err
            );
            // 개별 구매 요청 오류는 무시하고 계속 진행
          }
        }
      } catch (err) {
        console.error(
          `[getMyPurchaseRequests] 프로젝트 ${projectId} 조회 실패:`,
          err
        );
        // 개별 프로젝트 오류는 무시하고 계속 진행
      }
    }

    // 4. 최신 순으로 정렬 (BigInt 비교 사용)
    myPurchaseRequests.sort((a, b) => {
      const timestampA = BigInt(a.timestamp);
      const timestampB = BigInt(b.timestamp);
      return timestampB > timestampA ? 1 : timestampB < timestampA ? -1 : 0;
    });

    console.log(
      "[getMyPurchaseRequests] 조회된 구매 요청 수:",
      myPurchaseRequests.length
    );

    res.json({
      success: true,
      message: "구매 요청 목록을 성공적으로 조회했습니다.",
      data: stringifyBigInts({
        purchaseRequests: myPurchaseRequests,
        totalCount: myPurchaseRequests.length,
      }),
    });
  } catch (error) {
    console.error("[getMyPurchaseRequests] 오류:", error);
    res.status(500).json({
      success: false,
      message: "구매 요청 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 3.3. NFT 조회
// ---------------------------------------------

/**
 * 내가 소유한 Merchandise NFT 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMyMerchandiseNFTs = async (req, res) => {
  const accessToken = req.token;

  try {
    // 1. 사용자 지갑 정보 조회
    const walletInfo = await walletService.getWallet(accessToken);

    if (!walletInfo || !walletInfo.address) {
      return res.status(401).json({
        success: false,
        message: "유효한 지갑 정보를 찾을 수 없습니다.",
      });
    }

    logger.info(`[getMyMerchandiseNFTs] 사용자 주소: ${walletInfo.address}`);

    // 2. 전체 프로젝트 수 조회
    const totalProjects = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    logger.info(
      `[getMyMerchandiseNFTs] 전체 프로젝트 수: ${totalProjects.toString()}`
    );

    const myNFTs = [];

    // 3. 각 프로젝트에서 발행된 NFT들을 확인
    for (let projectId = 0; projectId < totalProjects; projectId++) {
      try {
        // 프로젝트 정보 조회
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call();

        // 프로젝트가 존재하지 않으면 건너뛰기
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          continue;
        }

        // 프로젝트별 토큰 시작 ID 조회
        const tokenStartId = await merchandiseFactoryContract.methods
          .getProjectTokenStart(projectId)
          .call();

        const mintedCount = projectInfo._mintedCount;
        logger.info(
          `[getMyMerchandiseNFTs] 프로젝트 ${projectId}: 토큰 시작 ID ${tokenStartId}, 민팅된 수 ${mintedCount}`
        );

        // 4. 각 토큰 확인
        for (let i = 0; i < mintedCount; i++) {
          const tokenId = BigInt(tokenStartId) + BigInt(i);

          try {
            // 토큰이 존재하는지 확인
            const exists = await merchandiseFactoryContract.methods
              .exists(tokenId)
              .call();

            if (!exists) {
              logger.debug(
                `[getMyMerchandiseNFTs] 토큰 ${tokenId}는 존재하지 않음`
              );
              continue;
            }

            // 토큰 소유자 확인
            const owner = await merchandiseFactoryContract.methods
              .ownerOf(tokenId)
              .call();

            logger.debug(
              `[getMyMerchandiseNFTs] 토큰 ${tokenId} 소유자: ${owner}`
            );

            // 내가 소유한 토큰만 필터링
            if (owner.toLowerCase() !== walletInfo.address.toLowerCase()) {
              continue;
            }

            // 토큰 URI 조회
            const tokenURI = await merchandiseFactoryContract.methods
              .tokenURI(tokenId)
              .call();

            // 토큰별 프로젝트 ID 조회
            const tokenProjectId = await merchandiseFactoryContract.methods
              .getTokenProject(tokenId)
              .call();

            myNFTs.push({
              tokenId: tokenId.toString(),
              contract: merchandiseFactoryContract.options.address,
              owner: owner,
              projectId: tokenProjectId.toString(),
              projectName: projectInfo._projectName,
              projectDescription: projectInfo._productDescription,
              projectImageURI:
                projectInfo._projectImageURI &&
                projectInfo._projectImageURI.startsWith("ipfs://")
                  ? projectInfo._projectImageURI.replace(
                      "ipfs://",
                      "https://ipfs.io/ipfs/"
                    )
                  : projectInfo._projectImageURI,
              tokenURI:
                tokenURI && tokenURI.startsWith("ipfs://")
                  ? tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
                  : tokenURI,
              purchaseAmount: web3.utils.fromWei(
                projectInfo._salePrice.toString(),
                "ether"
              ),
              totalSupply: projectInfo._totalSupply.toString(),
              mintedCount: projectInfo._mintedCount.toString(),
              isActive: projectInfo._isActive,
              createdAt: projectInfo._createdAt.toString(),
            });
          } catch (error) {
            logger.error(
              `[getMyMerchandiseNFTs] 토큰 ${tokenId} 조회 실패: ${error.message}`
            );
            // 개별 토큰 오류는 무시하고 계속 진행
          }
        }
      } catch (error) {
        logger.error(
          `[getMyMerchandiseNFTs] 프로젝트 ${projectId} 조회 실패: ${error.message}`
        );
        // 개별 프로젝트 오류는 무시하고 계속 진행
      }
    }

    logger.info(`[getMyMerchandiseNFTs] 조회된 NFT 수: ${myNFTs.length}`);

    return res.json({
      success: true,
      message: "내 Merchandise NFT 목록을 성공적으로 조회했습니다.",
      data: stringifyBigInts({
        nfts: myNFTs,
        totalCount: myNFTs.length,
        userAddress: walletInfo.address,
      }),
    });
  } catch (error) {
    logger.error(`[getMyMerchandiseNFTs] 오류: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "내 Merchandise NFT 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * @summary 전체 Merchandise NFT 목록 조회 (관리자용)
 */
const getAllMerchandiseNFTs = async (req, res) => {
  try {
    console.log("[getAllMerchandiseNFTs] 전체 Merchandise NFT 조회 시작");

    // 1. 전체 프로젝트 수 조회
    const totalProjects = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    console.log(
      "[getAllMerchandiseNFTs] 전체 프로젝트 수:",
      totalProjects.toString()
    );

    const allNFTs = [];

    // 2. 각 프로젝트에서 발행된 NFT들을 확인
    for (let projectId = 0; projectId < totalProjects; projectId++) {
      try {
        // 프로젝트 정보 조회
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call();

        // 프로젝트가 존재하지 않으면 건너뛰기
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          continue;
        }

        // 프로젝트별 토큰 시작 ID 조회
        const tokenStartId = await merchandiseFactoryContract.methods
          .getProjectTokenStart(projectId)
          .call();

        const mintedCount = projectInfo._mintedCount;
        console.log(
          `[getAllMerchandiseNFTs] 프로젝트 ${projectId}: 토큰 시작 ID ${tokenStartId}, 민팅된 수 ${mintedCount}`
        );

        // 3. 각 토큰 확인
        for (let i = 0; i < mintedCount; i++) {
          const tokenId = BigInt(tokenStartId) + BigInt(i);

          try {
            // 토큰이 존재하는지 확인
            const exists = await merchandiseFactoryContract.methods
              .exists(tokenId)
              .call();

            if (!exists) {
              console.log(
                `[getAllMerchandiseNFTs] 토큰 ${tokenId}는 존재하지 않음`
              );
              continue;
            }

            // 토큰 소유자 확인
            const owner = await merchandiseFactoryContract.methods
              .ownerOf(tokenId)
              .call();

            // 토큰 URI 조회
            const tokenURI = await merchandiseFactoryContract.methods
              .tokenURI(tokenId)
              .call();

            // 토큰별 프로젝트 ID 조회
            const tokenProjectId = await merchandiseFactoryContract.methods
              .getTokenProject(tokenId)
              .call();

            allNFTs.push({
              tokenId: tokenId.toString(),
              contract: merchandiseFactoryContract.options.address,
              owner: owner,
              projectId: tokenProjectId.toString(),
              projectName: projectInfo._projectName,
              projectDescription: projectInfo._productDescription,
              influencer: projectInfo._influencer,
              projectImageURI:
                projectInfo._projectImageURI &&
                projectInfo._projectImageURI.startsWith("ipfs://")
                  ? projectInfo._projectImageURI.replace(
                      "ipfs://",
                      "https://ipfs.io/ipfs/"
                    )
                  : projectInfo._projectImageURI,
              tokenURI:
                tokenURI && tokenURI.startsWith("ipfs://")
                  ? tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
                  : tokenURI,
              purchaseAmount: web3.utils.fromWei(
                projectInfo._salePrice.toString(),
                "ether"
              ),
              totalSupply: projectInfo._totalSupply.toString(),
              mintedCount: projectInfo._mintedCount.toString(),
              isActive: projectInfo._isActive,
              createdAt: projectInfo._createdAt.toString(),
            });
          } catch (error) {
            console.error(
              `[getAllMerchandiseNFTs] 토큰 ${tokenId} 조회 실패:`,
              error
            );
            // 개별 토큰 오류는 무시하고 계속 진행
          }
        }
      } catch (error) {
        console.error(
          `[getAllMerchandiseNFTs] 프로젝트 ${projectId} 조회 실패:`,
          error
        );
        // 개별 프로젝트 오류는 무시하고 계속 진행
      }
    }

    console.log("[getAllMerchandiseNFTs] 조회된 NFT 수:", allNFTs.length);

    res.json({
      success: true,
      message: "전체 Merchandise NFT 목록을 성공적으로 조회했습니다.",
      data: stringifyBigInts({
        nfts: allNFTs,
        totalCount: allNFTs.length,
      }),
    });
  } catch (error) {
    console.error("[getAllMerchandiseNFTs] 오류:", error);
    res.status(500).json({
      success: false,
      message: "전체 Merchandise NFT 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * @summary 특정 Merchandise NFT 정보 조회
 */
const getMerchandiseNFTInfo = async (req, res) => {
  try {
    const { tokenId } = req.params;

    if (tokenId === undefined || tokenId === null || isNaN(tokenId)) {
      return res.status(400).json({
        success: false,
        message: "유효한 토큰 ID를 입력해주세요.",
      });
    }

    console.log("[getMerchandiseNFTInfo] 토큰 ID:", tokenId);

    // 1. 토큰이 존재하는지 확인
    const exists = await merchandiseFactoryContract.methods
      .exists(tokenId)
      .call();

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "해당 Merchandise NFT를 찾을 수 없습니다.",
      });
    }

    // 2. 토큰 소유자 확인
    const owner = await merchandiseFactoryContract.methods
      .ownerOf(tokenId)
      .call();

    // 3. 토큰 URI 조회
    const tokenURI = await merchandiseFactoryContract.methods
      .tokenURI(tokenId)
      .call();

    // 4. 토큰별 프로젝트 ID 조회
    const projectId = await merchandiseFactoryContract.methods
      .getTokenProject(tokenId)
      .call();

    // 5. 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    const nftInfo = {
      tokenId: tokenId,
      contract: merchandiseFactoryContract.options.address,
      owner: owner,
      projectId: projectId.toString(),
      projectName: projectInfo._projectName,
      projectDescription: projectInfo._productDescription,
      influencer: projectInfo._influencer,
      projectImageURI:
        projectInfo._projectImageURI &&
        projectInfo._projectImageURI.startsWith("ipfs://")
          ? projectInfo._projectImageURI.replace(
              "ipfs://",
              "https://ipfs.io/ipfs/"
            )
          : projectInfo._projectImageURI,
      tokenURI:
        tokenURI && tokenURI.startsWith("ipfs://")
          ? tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
          : tokenURI,
      purchaseAmount: web3.utils.fromWei(
        projectInfo._salePrice.toString(),
        "ether"
      ),
      totalSupply: projectInfo._totalSupply.toString(),
      mintedCount: projectInfo._mintedCount.toString(),
      isActive: projectInfo._isActive,
      createdAt: projectInfo._createdAt.toString(),
    };

    res.json({
      success: true,
      message: "Merchandise NFT 정보를 성공적으로 조회했습니다.",
      data: stringifyBigInts(nftInfo),
    });
  } catch (error) {
    console.error("[getMerchandiseNFTInfo] 오류:", error);
    res.status(500).json({
      success: false,
      message: "Merchandise NFT 정보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// =============================================
// 4. 유틸리티 및 기타
// =============================================

/**
 * 플랫폼 수수료 정보 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPlatformFeeInfo = async (req, res) => {
  try {
    // 1. 수수료 수취 주소 조회
    const platformFeeCollector = await merchandiseFactoryContract.methods
      .platformFeeCollector()
      .call();

    // 2. 수수료 비율 조회
    const platformFeePercentage = await merchandiseFactoryContract.methods
      .platformFeePercentage()
      .call();

    // 3. 수수료 비율을 퍼센트로 변환 (basis points -> percentage)
    const feePercentage = Number(platformFeePercentage) / 100;

    res.json({
      success: true,
      message: "플랫폼 수수료 정보를 성공적으로 조회했습니다.",
      data: {
        platformFeeCollector: platformFeeCollector,
        platformFeePercentage: feePercentage,
        platformFeeBasisPoints: platformFeePercentage.toString(),
      },
    });
  } catch (error) {
    console.error("[getPlatformFeeInfo] 오류:", error);
    res.status(500).json({
      success: false,
      message: "플랫폼 수수료 정보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 4.1. 영수증 API
// ---------------------------------------------

/**
 * 전체 영수증 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllReceipts = async (req, res) => {
  try {
    const result = await receiptGenerator.getAllReceipts();

    if (result.success) {
      res.json({
        success: true,
        message: "영수증 목록을 성공적으로 조회했습니다.",
        data: {
          totalCount: result.receipts.length,
          receipts: result.receipts,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "영수증 목록 조회 중 오류가 발생했습니다.",
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("영수증 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "영수증 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * ID로 특정 영수증 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.receiptId - 영수증 ID
 * @param {Object} res - Express response object
 */
const getReceiptById = async (req, res) => {
  const { receiptId } = req.params;

  if (!receiptId) {
    return res.status(400).json({
      success: false,
      message: "영수증 ID를 입력해주세요.",
    });
  }

  try {
    const result = await receiptGenerator.getReceipt(receiptId);

    if (result.success) {
      res.json({
        success: true,
        message: "영수증을 성공적으로 조회했습니다.",
        data: result.receipt,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "영수증을 찾을 수 없습니다.",
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("영수증 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "영수증 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * 프로젝트 ID로 영수증 목록 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.projectId - 프로젝트 ID
 * @param {Object} res - Express response object
 */
const getReceiptsByProject = async (req, res) => {
  const { projectId } = req.params;

  if (projectId === undefined || projectId === null) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID를 입력해주세요.",
    });
  }

  try {
    const result = await receiptGenerator.getReceiptsByProject(projectId);

    if (result.success) {
      res.json({
        success: true,
        message: "프로젝트 영수증 목록을 성공적으로 조회했습니다.",
        data: {
          projectId: projectId,
          totalCount: result.receipts.length,
          receipts: result.receipts,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "프로젝트 영수증 목록 조회 중 오류가 발생했습니다.",
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("프로젝트 영수증 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "프로젝트 영수증 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * PDF 영수증 생성 및 다운로드
 * @param {Object} req - Express request object
 * @param {string} req.params.receiptId - 영수증 ID
 * @param {Object} res - Express response object
 */
const generatePDFReceipt = async (req, res) => {
  const { receiptId } = req.params;

  try {
    if (!receiptId) {
      return res.status(400).json({
        success: false,
        message: "영수증 ID를 입력해주세요.",
      });
    }

    // 1. 영수증 JSON 데이터 조회
    const receiptResult = await receiptGenerator.getReceipt(receiptId);

    if (!receiptResult.success) {
      return res.status(404).json({
        success: false,
        message: "영수증을 찾을 수 없습니다.",
        error: receiptResult.error,
      });
    }

    const receiptData = receiptResult.receipt;

    // 2. PDF 생성 (없는 경우에만)
    const pdfResult = await pdfReceiptGenerator.generatePDFIfNotExists(
      receiptData
    );

    if (!pdfResult.success) {
      return res.status(500).json({
        success: false,
        message: "PDF 생성 중 오류가 발생했습니다.",
        error: pdfResult.error,
      });
    }

    // 3. PDF 파일 전송
    const pdfPath = pdfResult.pdfPath;
    const fileName = pdfResult.pdfFileName;

    // 파일 존재 확인
    const fs = require("fs");
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: "PDF 파일을 찾을 수 없습니다.",
      });
    }

    // PDF 파일 전송
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error("PDF 영수증 다운로드 실패", error);
    res.status(500).json({
      success: false,
      message: "PDF 영수증 다운로드 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

module.exports = {
  // 1. 프로젝트 관리
  createProject,
  setActive,

  // 2. 구매 플로우
  requestPurchase,
  confirmPurchase,
  cancelPurchase,

  // 3. 조회
  getAllProjects,
  getMyProjects,
  getBrandPendingProjects,
  getPurchaseRequest,
  getProjectPurchaseRequests,
  getMyPurchaseRequests,
  getMyMerchandiseNFTs,
  getAllMerchandiseNFTs,
  getMerchandiseNFTInfo,

  // 4. 유틸리티
  getPlatformFeeInfo,
  getAllReceipts,
  getReceiptById,
  getReceiptsByProject,
  generatePDFReceipt,
};
