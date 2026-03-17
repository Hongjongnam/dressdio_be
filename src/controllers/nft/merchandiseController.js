const {
  web3,
  merchandiseFactoryContract,
  dpTokenContract,
  creatorSBTContract,
  platformRegistryContract,
} = require("../../config/web3");
const { uploadFileToIPFS, uploadJSONToIPFS } = require("../../services/upload");
const walletService = require("../../services/wallet");
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

    // 역할별 플랫폼 수수료 비율 조회
    const allFees = await merchandiseFactoryContract.methods
      .getAllFeePercentages()
      .call();
    const brandFeePercentage = allFees._brandFee;
    const artistFeePercentage = allFees._artistFee;
    const influencerFeePercentage = allFees._influencerFee;

    logger.info(
      `[calculateDistributionData] 수수료 - 브랜드: ${brandFeePercentage}, 아티스트: ${artistFeePercentage}, 인플루언서: ${influencerFeePercentage} basis points`
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
        (brandPrice * BigInt(brandFeePercentage)) / BigInt(10000);
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
          (artistPrice * BigInt(artistFeePercentage)) / BigInt(10000);
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
        (influencerMargin * BigInt(influencerFeePercentage)) / BigInt(10000);
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
      // Data URL 형식 검증 (data:image/...)
      const isDataUrl = projectImageUrl.startsWith("data:image/");
      const isHttpUrl =
        projectImageUrl.startsWith("http://") ||
        projectImageUrl.startsWith("https://");

      if (!isDataUrl && !isHttpUrl) {
        return res.status(400).json({
          success: false,
          message:
            "잘못된 이미지 URL 형식입니다. (HTTP/HTTPS URL 또는 Data URL만 지원)",
        });
      }

      // URL 길이 검증 (Data URL 고려하여 제한 증가)
      if (projectImageUrl.length > 10485760) {
        // 10MB (10,485,760자)
        return res.status(400).json({
          success: false,
          message: "이미지 URL이 너무 깁니다. (최대 10MB)",
        });
      }

      // 매우 긴 URL에 대한 로깅 최적화
      if (projectImageUrl.length > 1000) {
        logger.info(
          `[Create Project] Long URL detected (${
            projectImageUrl.length
          } chars): ${projectImageUrl.substring(0, 100)}...`
        );
      }

      try {
        let buffer;
        let filename;

        if (isDataUrl) {
          // Data URL 처리
          const base64Data = projectImageUrl.split(",")[1];
          if (!base64Data) {
            throw new Error("Invalid data URL format");
          }
          buffer = Buffer.from(base64Data, "base64");

          // MIME 타입에서 확장자 추출
          const mimeMatch = projectImageUrl.match(/data:image\/([^;]+)/);
          const extension = mimeMatch ? mimeMatch[1] : "png";
          filename = `image.${extension}`;

          logger.info(
            `[Create Project] Processing data URL with ${buffer.length} bytes`
          );
        } else {
          // HTTP URL 처리
          const response = await axios.get(projectImageUrl, {
            responseType: "arraybuffer",
          });
          buffer = Buffer.from(response.data, "binary");
          filename =
            new URL(projectImageUrl).pathname.split("/").pop() || "image.png";
        }

        projectImageUri = await uploadFileToIPFS(buffer, filename);
      } catch (err) {
        logger.error("Failed to process image URL:", err);
        return res.status(500).json({
          success: false,
          message: "이미지를 처리하는 데 실패했습니다.",
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

    // projectImageUri는 선택 사항 - 없으면 빈 문자열로 스마트 컨트랙트에 전달

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
    // artistIPNFTTokenIds는 선택 사항 - 브랜드 IPNFT만으로도 프로젝트 생성 가능

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

  if (
    projectId === undefined ||
    projectId === null ||
    !devicePassword ||
    !storedWalletData
  ) {
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
// 구매확정 큐 시스템
const purchaseQueue = [];
let isProcessingQueue = false;

// 큐 처리 함수
const processPurchaseQueue = async () => {
  if (isProcessingQueue || purchaseQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  logger.info(
    `[PurchaseQueue] 큐 처리 시작. 대기 중인 요청: ${purchaseQueue.length}개`
  );

  while (purchaseQueue.length > 0) {
    const { req, res } = purchaseQueue.shift();
    logger.info(
      `[PurchaseQueue] 처리 중... 남은 요청: ${purchaseQueue.length}개`
    );

    try {
      await executeConfirmPurchase(req, res);
    } catch (error) {
      logger.error(`[PurchaseQueue] 구매확정 처리 실패:`, error);
      // 에러 응답은 executeConfirmPurchase에서 처리됨
    }
  }

  isProcessingQueue = false;
  logger.info(`[PurchaseQueue] 큐 처리 완료`);
};

// 메인 confirmPurchase 함수 (큐 기반)
const confirmPurchase = async (req, res) => {
  const { projectId, requestId, devicePassword, storedWalletData } = req.body;

  // 필수 필드 검증
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

  // 큐에 추가
  purchaseQueue.push({ req, res });
  logger.info(
    `[ConfirmPurchase] 구매확정 요청이 큐에 추가됨. 대기열 길이: ${purchaseQueue.length}`
  );

  // 큐 처리 시작 (비동기)
  processPurchaseQueue().catch((error) => {
    logger.error("[ConfirmPurchase] 큐 처리 중 오류:", error);
  });
};

// 실제 구매확정 실행 함수
const executeConfirmPurchase = async (req, res) => {
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

    // 2. IPNFT 컨트랙트 정보를 미리 조회 (1번만)
    console.log("[brand-pending] IPNFT 컨트랙트 정보 조회 중...");
    const ipnftFactoryAddr = await platformRegistryContract.methods
      .ipnftFactory()
      .call();
    const ipnftFactory = new web3.eth.Contract(
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

    // 3. 모든 프로젝트 정보를 병렬로 조회
    console.log("[brand-pending] 프로젝트 정보 병렬 조회 시작...");
    const projectPromises = [];
    for (let i = 0; i < projectCount; i++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .getProjectInfo(i)
          .call()
          .then((projectInfo) => ({ projectId: i, projectInfo }))
          .catch((err) => {
            console.error(`[brand-pending] 프로젝트 ${i} 조회 실패:`, err);
            return null;
          })
      );
    }

    const projectResults = await Promise.all(projectPromises);
    const validProjects = projectResults.filter(
      (result) =>
        result &&
        result.projectInfo._influencer &&
        result.projectInfo._influencer !==
          "0x0000000000000000000000000000000000000000" &&
        !result.projectInfo._isActive
    );

    console.log(
      `[brand-pending] 유효한 비활성화 프로젝트 수: ${validProjects.length}`
    );

    // 4. 브랜드 소유자 확인을 병렬로 조회
    const brandOwnerPromises = validProjects.map(({ projectId, projectInfo }) =>
      ipnftContract.methods
        .ownerOf(projectInfo._brandIPNFTTokenId)
        .call()
        .then((brandOwner) => ({
          projectId,
          projectInfo,
          brandOwner,
        }))
        .catch((err) => {
          console.error(
            `[brand-pending] 프로젝트 ${projectId} 브랜드 소유자 조회 실패:`,
            err
          );
          return null;
        })
    );

    const brandOwnerResults = await Promise.all(brandOwnerPromises);

    // 5. 내 브랜드 프로젝트만 필터링
    const result = brandOwnerResults
      .filter(
        (result) =>
          result &&
          result.brandOwner &&
          result.brandOwner.toLowerCase() === myAddress
      )
      .map(({ projectId, projectInfo }) => {
        console.log(
          `[brand-pending] projectId=${projectId} : 내 브랜드 프로젝트로 추가!`
        );
        return {
          projectId: projectId,
          influencer: projectInfo._influencer,
          projectName: projectInfo._projectName,
          brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
          artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
          totalSupply: projectInfo._totalSupply,
          salePrice: web3.utils.fromWei(projectInfo._salePrice || "0", "ether"),
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
        };
      });

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

    // 3. 모든 프로젝트 정보를 병렬로 조회
    console.log("[getMyPurchaseRequests] 프로젝트 정보 병렬 조회 시작...");
    const projectPromises = [];
    for (let projectId = 0; projectId < projectCount; projectId++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call()
          .then((projectInfo) => ({ projectId, projectInfo }))
          .catch((err) => {
            console.error(
              `[getMyPurchaseRequests] 프로젝트 ${projectId} 조회 실패:`,
              err
            );
            return null;
          })
      );
    }

    const projectResults = await Promise.all(projectPromises);
    const validProjects = projectResults.filter(
      (result) =>
        result &&
        result.projectInfo._influencer &&
        result.projectInfo._influencer !==
          "0x0000000000000000000000000000000000000000"
    );

    console.log(
      `[getMyPurchaseRequests] 유효한 프로젝트 수: ${validProjects.length}`
    );

    // 4. 각 프로젝트의 구매 요청 수를 병렬로 조회
    const requestCountPromises = validProjects.map(({ projectId }) =>
      merchandiseFactoryContract.methods
        .projectTotalRequests(projectId)
        .call()
        .then((totalRequests) => ({ projectId, totalRequests }))
        .catch((err) => {
          console.error(
            `[getMyPurchaseRequests] 프로젝트 ${projectId} 요청 수 조회 실패:`,
            err
          );
          return { projectId, totalRequests: 0 };
        })
    );

    const requestCounts = await Promise.all(requestCountPromises);

    // 5. 모든 구매 요청을 병렬로 조회
    const allRequestPromises = [];
    requestCounts.forEach(({ projectId, totalRequests }) => {
      for (let requestId = 0; requestId < totalRequests; requestId++) {
        allRequestPromises.push(
          merchandiseFactoryContract.methods
            .getPurchaseRequest(projectId, requestId)
            .call()
            .then((purchaseRequest) => ({
              projectId,
              requestId,
              purchaseRequest,
            }))
            .catch((err) => {
              console.error(
                `[getMyPurchaseRequests] 구매 요청 ${projectId}-${requestId} 조회 실패:`,
                err
              );
              return null;
            })
        );
      }
    });

    console.log(
      `[getMyPurchaseRequests] 총 구매 요청 조회 수: ${allRequestPromises.length}`
    );
    const allRequests = await Promise.all(allRequestPromises);

    // 6. 내 구매 요청만 필터링
    const myRequests = allRequests
      .filter(
        (result) =>
          result &&
          result.purchaseRequest.buyer &&
          result.purchaseRequest.buyer.toLowerCase() === buyerAddress
      )
      .map(({ projectId, requestId, purchaseRequest }) => ({
        projectId: projectId,
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
      }));

    myPurchaseRequests.push(...myRequests);

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

    // 3. 모든 프로젝트 정보를 병렬로 조회
    logger.info("[getMyMerchandiseNFTs] 프로젝트 정보 병렬 조회 시작...");
    const projectPromises = [];
    for (let projectId = 0; projectId < totalProjects; projectId++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call()
          .then((projectInfo) => ({ projectId, projectInfo }))
          .catch((err) => {
            logger.error(
              `[getMyMerchandiseNFTs] 프로젝트 ${projectId} 조회 실패:`,
              err
            );
            return null;
          })
      );
    }

    const projectResults = await Promise.all(projectPromises);
    const validProjects = projectResults.filter(
      (result) =>
        result &&
        result.projectInfo._influencer &&
        result.projectInfo._influencer !==
          "0x0000000000000000000000000000000000000000"
    );

    logger.info(
      `[getMyMerchandiseNFTs] 유효한 프로젝트 수: ${validProjects.length}`
    );

    // 4. 각 프로젝트의 토큰 시작 ID를 병렬로 조회
    const tokenStartPromises = validProjects.map(({ projectId }) =>
      merchandiseFactoryContract.methods
        .getProjectTokenStart(projectId)
        .call()
        .then((tokenStartId) => ({ projectId, tokenStartId }))
        .catch((err) => {
          logger.error(
            `[getMyMerchandiseNFTs] 프로젝트 ${projectId} 토큰 시작 ID 조회 실패:`,
            err
          );
          return { projectId, tokenStartId: 0 };
        })
    );

    const tokenStarts = await Promise.all(tokenStartPromises);

    // 5. 모든 토큰 정보를 병렬로 조회
    const allTokenPromises = [];
    validProjects.forEach(({ projectId, projectInfo }) => {
      const tokenStart = tokenStarts.find((ts) => ts.projectId === projectId);
      if (!tokenStart) return;

      const mintedCount = projectInfo._mintedCount;
      for (let i = 0; i < mintedCount; i++) {
        const tokenId = BigInt(tokenStart.tokenStartId) + BigInt(i);

        // 각 토큰의 모든 정보를 병렬로 조회
        const tokenPromises = [
          merchandiseFactoryContract.methods.exists(tokenId).call(),
          merchandiseFactoryContract.methods.ownerOf(tokenId).call(),
          merchandiseFactoryContract.methods.tokenURI(tokenId).call(),
          merchandiseFactoryContract.methods.getTokenProject(tokenId).call(),
        ];

        allTokenPromises.push(
          Promise.all(tokenPromises)
            .then(([exists, owner, tokenURI, tokenProjectId]) => ({
              projectId,
              tokenId: tokenId.toString(),
              projectInfo,
              exists,
              owner,
              tokenURI,
              tokenProjectId,
            }))
            .catch((err) => {
              logger.error(
                `[getMyMerchandiseNFTs] 토큰 ${tokenId} 조회 실패:`,
                err
              );
              return null;
            })
        );
      }
    });

    logger.info(
      `[getMyMerchandiseNFTs] 총 토큰 조회 수: ${allTokenPromises.length}`
    );
    const allTokens = await Promise.all(allTokenPromises);

    // 6. 내가 소유한 토큰만 필터링하고 메타데이터 조회
    const myTokenPromises = allTokens
      .filter(
        (token) =>
          token &&
          token.exists &&
          token.owner &&
          token.owner.toLowerCase() === walletInfo.address.toLowerCase()
      )
      .map(async (token) => {
        // IPFS 메타데이터 조회 (병렬)
        let nftImageURI = null;
        try {
          let metaUrl = token.tokenURI;
          if (token.tokenURI && token.tokenURI.startsWith("ipfs://")) {
            metaUrl = token.tokenURI.replace(
              "ipfs://",
              "https://ipfs.io/ipfs/"
            );
          }

          try {
            const metaRes = await axios.get(metaUrl, { timeout: 5000 });
            if (metaRes.data && metaRes.data.image) {
              nftImageURI = metaRes.data.image.startsWith("ipfs://")
                ? metaRes.data.image.replace("ipfs://", "https://ipfs.io/ipfs/")
                : metaRes.data.image;
            }
          } catch (err) {
            // ipfs.io 실패 시 dweb.link로 재시도
            const fallbackUrl = metaUrl.replace("ipfs.io", "dweb.link");
            const metaRes = await axios.get(fallbackUrl, { timeout: 5000 });
            if (metaRes.data && metaRes.data.image) {
              nftImageURI = metaRes.data.image.startsWith("ipfs://")
                ? metaRes.data.image.replace("ipfs://", "https://ipfs.io/ipfs/")
                : metaRes.data.image;
            }
          }
        } catch (err) {
          logger.warn(
            `[getMyMerchandiseNFTs] 메타데이터 조회 실패: ${token.tokenId}`,
            err.message
          );
        }

        return {
          tokenId: token.tokenId,
          contract: merchandiseFactoryContract.options.address,
          owner: token.owner,
          projectId: token.tokenProjectId.toString(),
          projectName: token.projectInfo._projectName,
          projectDescription: token.projectInfo._productDescription,
          projectImageURI:
            token.projectInfo._projectImageURI &&
            token.projectInfo._projectImageURI.startsWith("ipfs://")
              ? token.projectInfo._projectImageURI.replace(
                  "ipfs://",
                  "https://ipfs.io/ipfs/"
                )
              : token.projectInfo._projectImageURI,
          tokenURI:
            token.tokenURI && token.tokenURI.startsWith("ipfs://")
              ? token.tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
              : token.tokenURI,
          nftImageURI,
          purchaseAmount: web3.utils.fromWei(
            token.projectInfo._salePrice.toString(),
            "ether"
          ),
          totalSupply: token.projectInfo._totalSupply.toString(),
          mintedCount: token.projectInfo._mintedCount.toString(),
          isActive: token.projectInfo._isActive,
          createdAt: token.projectInfo._createdAt.toString(),
        };
      });

    const myNFTs = await Promise.all(myTokenPromises);

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

    // 2. 모든 프로젝트 정보를 병렬로 조회
    console.log("[getAllMerchandiseNFTs] 프로젝트 정보 병렬 조회 시작...");
    const projectPromises = [];
    for (let projectId = 0; projectId < totalProjects; projectId++) {
      projectPromises.push(
        merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call()
          .then((projectInfo) => ({ projectId, projectInfo }))
          .catch((err) => {
            console.error(
              `[getAllMerchandiseNFTs] 프로젝트 ${projectId} 조회 실패:`,
              err
            );
            return null;
          })
      );
    }

    const projectResults = await Promise.all(projectPromises);
    const validProjects = projectResults.filter(
      (result) =>
        result &&
        result.projectInfo._influencer &&
        result.projectInfo._influencer !==
          "0x0000000000000000000000000000000000000000"
    );

    console.log(
      `[getAllMerchandiseNFTs] 유효한 프로젝트 수: ${validProjects.length}`
    );

    // 3. 각 프로젝트의 토큰 시작 ID를 병렬로 조회
    const tokenStartPromises = validProjects.map(({ projectId }) =>
      merchandiseFactoryContract.methods
        .getProjectTokenStart(projectId)
        .call()
        .then((tokenStartId) => ({ projectId, tokenStartId }))
        .catch((err) => {
          console.error(
            `[getAllMerchandiseNFTs] 프로젝트 ${projectId} 토큰 시작 ID 조회 실패:`,
            err
          );
          return { projectId, tokenStartId: 0 };
        })
    );

    const tokenStarts = await Promise.all(tokenStartPromises);

    // 4. 모든 토큰 정보를 병렬로 조회
    const allTokenPromises = [];
    validProjects.forEach(({ projectId, projectInfo }) => {
      const tokenStart = tokenStarts.find((ts) => ts.projectId === projectId);
      if (!tokenStart) return;

      const mintedCount = projectInfo._mintedCount;
      for (let i = 0; i < mintedCount; i++) {
        const tokenId = BigInt(tokenStart.tokenStartId) + BigInt(i);

        // 각 토큰의 모든 정보를 병렬로 조회
        const tokenPromises = [
          merchandiseFactoryContract.methods.exists(tokenId).call(),
          merchandiseFactoryContract.methods.ownerOf(tokenId).call(),
          merchandiseFactoryContract.methods.tokenURI(tokenId).call(),
        ];

        allTokenPromises.push(
          Promise.all(tokenPromises)
            .then(([exists, owner, tokenURI]) => ({
              projectId,
              tokenId: tokenId.toString(),
              projectInfo,
              exists,
              owner,
              tokenURI,
            }))
            .catch((err) => {
              console.error(
                `[getAllMerchandiseNFTs] 토큰 ${tokenId} 조회 실패:`,
                err
              );
              return null;
            })
        );
      }
    });

    console.log(
      `[getAllMerchandiseNFTs] 총 토큰 조회 수: ${allTokenPromises.length}`
    );
    const allTokens = await Promise.all(allTokenPromises);

    // 5. 존재하는 토큰만 필터링하고 메타데이터 조회
    const nftPromises = allTokens
      .filter((token) => token && token.exists)
      .map(async (token) => {
        // IPFS 메타데이터 조회 (병렬)
        let nftImageURI = null;
        try {
          let metaUrl = token.tokenURI;
          if (token.tokenURI && token.tokenURI.startsWith("ipfs://")) {
            metaUrl = token.tokenURI.replace(
              "ipfs://",
              "https://ipfs.io/ipfs/"
            );
          }

          try {
            const metaRes = await axios.get(metaUrl, { timeout: 5000 });
            if (metaRes.data && metaRes.data.image) {
              nftImageURI = metaRes.data.image.startsWith("ipfs://")
                ? metaRes.data.image.replace("ipfs://", "https://ipfs.io/ipfs/")
                : metaRes.data.image;
            }
          } catch (err) {
            // ipfs.io 실패 시 dweb.link로 재시도
            const fallbackUrl = metaUrl.replace("ipfs.io", "dweb.link");
            const metaRes = await axios.get(fallbackUrl, { timeout: 5000 });
            if (metaRes.data && metaRes.data.image) {
              nftImageURI = metaRes.data.image.startsWith("ipfs://")
                ? metaRes.data.image.replace("ipfs://", "https://ipfs.io/ipfs/")
                : metaRes.data.image;
            }
          }
        } catch (err) {
          console.warn(
            `[getAllMerchandiseNFTs] 메타데이터 조회 실패: ${token.tokenId}`,
            err.message
          );
        }

        return {
          tokenId: token.tokenId,
          contract: merchandiseFactoryContract.options.address,
          owner: token.owner,
          projectId: token.projectId.toString(),
          projectName: token.projectInfo._projectName,
          projectDescription: token.projectInfo._productDescription,
          influencer: token.projectInfo._influencer,
          projectImageURI:
            token.projectInfo._projectImageURI &&
            token.projectInfo._projectImageURI.startsWith("ipfs://")
              ? token.projectInfo._projectImageURI.replace(
                  "ipfs://",
                  "https://ipfs.io/ipfs/"
                )
              : token.projectInfo._projectImageURI,
          tokenURI:
            token.tokenURI && token.tokenURI.startsWith("ipfs://")
              ? token.tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
              : token.tokenURI,
          nftImageURI,
          purchaseAmount: web3.utils.fromWei(
            token.projectInfo._salePrice.toString(),
            "ether"
          ),
          totalSupply: token.projectInfo._totalSupply.toString(),
          mintedCount: token.projectInfo._mintedCount.toString(),
          isActive: token.projectInfo._isActive,
          createdAt: token.projectInfo._createdAt.toString(),
        };
      });

    const allNFTs = await Promise.all(nftPromises);

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

    // tokenURI에서 image 필드 추출 (ipfs.io 실패 시 dweb.link로 fallback)
    let nftImageURI = null;
    let metaResData = null;
    let triedUrls = [];
    try {
      let metaUrl = tokenURI;
      if (tokenURI && tokenURI.startsWith("ipfs://")) {
        metaUrl = tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/");
      }
      triedUrls.push(metaUrl);
      try {
        const metaRes = await axios.get(metaUrl);
        metaResData = metaRes.data;
      } catch (err) {
        // ipfs.io 실패 시 dweb.link로 재시도
        metaUrl = metaUrl.replace("ipfs.io", "dweb.link");
        triedUrls.push(metaUrl);
        const metaRes = await axios.get(metaUrl);
        metaResData = metaRes.data;
      }
      if (metaResData && metaResData.image) {
        nftImageURI = metaResData.image.startsWith("ipfs://")
          ? metaResData.image.replace("ipfs://", "https://ipfs.io/ipfs/")
          : metaResData.image;
      }
    } catch (err) {
      console.warn(
        `[NFT-DEBUG] tokenURI fetch 실패: ${triedUrls.join(" -> ")}, ${
          err.message
        }`
      );
      nftImageURI = null;
    }

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
      nftImageURI, // 고유 NFT 이미지 주소 추가
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

    // 2. 역할별 수수료 비율 조회
    const allFees = await merchandiseFactoryContract.methods
      .getAllFeePercentages()
      .call();

    const toPercent = (bp) => Number(bp) / 100;

    res.json({
      success: true,
      message: "플랫폼 수수료 정보를 성공적으로 조회했습니다.",
      data: {
        platformFeeCollector,
        fees: {
          brand: {
            basisPoints: allFees._brandFee.toString(),
            percentage: toPercent(allFees._brandFee),
          },
          artist: {
            basisPoints: allFees._artistFee.toString(),
            percentage: toPercent(allFees._artistFee),
          },
          influencer: {
            basisPoints: allFees._influencerFee.toString(),
            percentage: toPercent(allFees._influencerFee),
          },
          cancel: {
            basisPoints: allFees._cancelFee.toString(),
            percentage: toPercent(allFees._cancelFee),
          },
        },
        description: "basis points: 100 = 1%, 최대 1000 = 10%",
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

/**
 * 역할별 플랫폼 수수료 설정 (관리자 전용)
 * @param {Object} req
 * @param {string} req.body.role - "brand" | "artist" | "influencer" | "cancel"
 * @param {number} req.body.feePercentage - basis points (100 = 1%, 최대 1000)
 * @param {Object} req.body.storedWalletData
 * @param {string} req.body.devicePassword
 */
const setPlatformFeeInfo = async (req, res) => {
  const { role, feePercentage, storedWalletData, devicePassword } = req.body;
  const accessToken = req.token;

  try {
    if (!role || feePercentage === undefined || !storedWalletData || !devicePassword) {
      return res.status(400).json({
        success: false,
        message: "role, feePercentage, storedWalletData, devicePassword 는 필수입니다.",
      });
    }

    const validRoles = ["brand", "artist", "influencer", "cancel"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `유효하지 않은 role 입니다. 허용값: ${validRoles.join(", ")}`,
      });
    }

    const feeValue = parseInt(feePercentage);
    if (isNaN(feeValue) || feeValue < 0 || feeValue > 1000) {
      return res.status(400).json({
        success: false,
        message: "feePercentage 는 0 ~ 1000 (basis points) 범위여야 합니다.",
      });
    }

    const txData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods
        .setPlatformFeePercentage(role, feeValue)
        .encodeABI(),
      value: "0",
    };

    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    res.json({
      success: true,
      message: `플랫폼 수수료(${role})가 ${feeValue / 100}% (${feeValue} basis points)로 설정되었습니다.`,
      data: {
        role,
        basisPoints: feeValue,
        percentage: feeValue / 100,
        txHash: receipt.transactionHash,
      },
    });
  } catch (error) {
    console.error("[setPlatformFeeInfo] 오류:", error);
    res.status(500).json({
      success: false,
      message: "플랫폼 수수료 설정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * 플랫폼 수수료 수취 주소 변경 (관리자 전용)
 * @param {string} req.body.newCollector   - 새 수수료 수취 지갑 주소
 * @param {string} req.body.devicePassword
 * @param {Object} req.body.storedWalletData
 */
const setPlatformFeeCollector = async (req, res) => {
  const { newCollector, storedWalletData, devicePassword } = req.body;
  const accessToken = req.token;

  try {
    if (!newCollector || !storedWalletData || !devicePassword) {
      return res.status(400).json({ success: false, message: "newCollector, storedWalletData, devicePassword 는 필수입니다." });
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(newCollector)) {
      return res.status(400).json({ success: false, message: "올바른 이더리움 주소 형식이 아닙니다." });
    }

    const txData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods.setPlatformFeeCollector(newCollector).encodeABI(),
      value: "0",
    };

    const receipt = await mpcService.executeTransactionWithStoredData(storedWalletData, devicePassword, txData, accessToken);

    res.json({
      success: true,
      message: `수수료 수취 주소가 ${newCollector} 로 변경되었습니다.`,
      data: { newCollector, txHash: receipt.transactionHash },
    });
  } catch (error) {
    console.error("[setPlatformFeeCollector] 오류:", error);
    res.status(500).json({ success: false, message: "수수료 수취 주소 변경 중 오류가 발생했습니다.", error: error.message });
  }
};

/**
 * 크리에이터 개별 수수료 조회
 * @param {string} req.query.creatorAddress - 크리에이터 지갑 주소
 * @param {string} req.query.role - "brand" | "artist" | "influencer"
 */
const getCreatorFee = async (req, res) => {
  try {
    const { creatorAddress, role } = req.query;
    if (!creatorAddress) {
      return res.status(400).json({ success: false, message: "creatorAddress 는 필수입니다." });
    }

    const effectiveRole = role || "brand";
    const result = await merchandiseFactoryContract.methods
      .getEffectiveCreatorFee(creatorAddress, effectiveRole)
      .call();

    const basisPoints = Number(result.effectiveFee);
    res.json({
      success: true,
      data: {
        creatorAddress,
        role: effectiveRole,
        isCustom: result.isCustom,
        basisPoints,
        percentage: basisPoints / 100,
        description: result.isCustom
          ? "개별 설정된 수수료입니다."
          : `role 기본값(${effectiveRole})이 적용됩니다.`,
      },
    });
  } catch (error) {
    console.error("[getCreatorFee] 오류:", error);
    res.status(500).json({ success: false, message: "크리에이터 수수료 조회 중 오류가 발생했습니다.", error: error.message });
  }
};

/**
 * 크리에이터 개별 수수료 설정 (관리자 전용)
 * @param {string} req.body.creatorAddress - 크리에이터 지갑 주소
 * @param {string} req.body.role           - "brand" | "artist" | "influencer"
 * @param {number} req.body.feePercentage  - basis points (0~1000)
 */
const setCreatorFee = async (req, res) => {
  const { creatorAddress, role, feePercentage, storedWalletData, devicePassword } = req.body;
  const accessToken = req.token;

  try {
    if (!creatorAddress || !role || feePercentage === undefined || !storedWalletData || !devicePassword) {
      return res.status(400).json({ success: false, message: "creatorAddress, role, feePercentage, storedWalletData, devicePassword 는 필수입니다." });
    }

    const validRoles = ["brand", "artist", "influencer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "role 은 brand, artist, influencer 중 하나여야 합니다." });
    }

    const feeValue = parseInt(feePercentage);
    if (isNaN(feeValue) || feeValue < 0 || feeValue > 1000) {
      return res.status(400).json({ success: false, message: "feePercentage 는 0~1000 (basis points) 범위여야 합니다." });
    }

    const txData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods.setCreatorFee(creatorAddress, role, feeValue).encodeABI(),
      value: "0",
    };

    const receipt = await mpcService.executeTransactionWithStoredData(storedWalletData, devicePassword, txData, accessToken);

    res.json({
      success: true,
      message: `크리에이터 ${creatorAddress} 의 ${role} 역할 수수료가 ${feeValue / 100}% (${feeValue} basis points)로 설정되었습니다.`,
      data: { creatorAddress, role, basisPoints: feeValue, percentage: feeValue / 100, txHash: receipt.transactionHash },
    });
  } catch (error) {
    console.error("[setCreatorFee] 오류:", error);
    res.status(500).json({ success: false, message: "크리에이터 수수료 설정 중 오류가 발생했습니다.", error: error.message });
  }
};

/**
 * 크리에이터 개별 수수료 제거 → role 기본값으로 복귀 (관리자 전용)
 * @param {string} req.body.creatorAddress - 크리에이터 지갑 주소
 * @param {string} req.body.role           - "brand" | "artist" | "influencer"
 */
const removeCreatorFee = async (req, res) => {
  const { creatorAddress, role, storedWalletData, devicePassword } = req.body;
  const accessToken = req.token;

  try {
    if (!creatorAddress || !role || !storedWalletData || !devicePassword) {
      return res.status(400).json({ success: false, message: "creatorAddress, role, storedWalletData, devicePassword 는 필수입니다." });
    }

    const validRoles = ["brand", "artist", "influencer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "role 은 brand, artist, influencer 중 하나여야 합니다." });
    }

    const txData = {
      to: merchandiseFactoryContract.options.address,
      data: merchandiseFactoryContract.methods.removeCreatorFee(creatorAddress, role).encodeABI(),
      value: "0",
    };

    const receipt = await mpcService.executeTransactionWithStoredData(storedWalletData, devicePassword, txData, accessToken);

    res.json({
      success: true,
      message: `크리에이터 ${creatorAddress} 의 ${role} 역할 개별 수수료가 제거되어 기본값으로 복귀됩니다.`,
      data: { creatorAddress, role, txHash: receipt.transactionHash },
    });
  } catch (error) {
    console.error("[removeCreatorFee] 오류:", error);
    res.status(500).json({ success: false, message: "크리에이터 수수료 제거 중 오류가 발생했습니다.", error: error.message });
  }
};

// 4.1. 영수증 API
// ---------------------------------------------


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
  setPlatformFeeInfo,
  setPlatformFeeCollector,
  getCreatorFee,
  setCreatorFee,
  removeCreatorFee,
};
