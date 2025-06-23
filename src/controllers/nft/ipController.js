const { uploadFileToIPFS } = require("../../services/upload");
const {
  web3,
  ipnftFactoryContract,
  creatorSBTContract,
  dpTokenContract,
  ipnftFactoryAddress,
  creatorSBTAddress,
  dpTokenAddress,
  devicePassword,
  IPNFTFactoryABI,
  CreatorSBTABI,
  DPTokenABI,
  IPNFTABI,
} = require("../../config/web3");
const { stringifyBigInts } = require("../../utils/utils");
const authService = require("../../services/auth");
const walletService = require("../../services/wallet");
const blockchainService = require("../../services/blockchain");
const logger = require("../../utils/logger");

/**
 * IP NFT 민팅 (WaaS)
 * @route POST /api/nft/ip/mint
 * @desc 사용자의 accessToken을 사용하여 DP 토큰을 approve하고 IPNFT를 민팅합니다.
 */
exports.mint = async (req, res) => {
  const accessToken = req.token;
  let ipfsImage = req.body.ipfsImage;
  const { name, description, price, supplyPrice, creatorType } = req.body;

  // DP 단위를 wei로 변환 (1 DP = 10^18 wei)
  const priceInWei = web3.utils.toWei(String(price), "ether");
  const supplyPriceInWei = web3.utils.toWei(String(supplyPrice), "ether");

  // 1. 파일이 첨부된 경우 IPFS 업로드
  if (req.file) {
    try {
      ipfsImage = await uploadFileToIPFS(
        req.file.buffer,
        req.file.originalname
      );
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "IPFS upload failed",
        error: err.message,
      });
    }
  }

  if (
    !ipfsImage ||
    !name ||
    !description ||
    price === undefined ||
    supplyPrice === undefined ||
    !creatorType
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  // 가격 유효성 검사 추가
  if (isNaN(price) || price <= 0 || isNaN(supplyPrice) || supplyPrice <= 0) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid price or supply price. Prices must be positive numbers.",
    });
  }

  // 공급 가격이 판매 가격보다 높으면 안됨
  if (Number(supplyPrice) >= Number(price)) {
    return res.status(400).json({
      success: false,
      message: "Supply price must be less than selling price",
    });
  }

  if (!ipnftFactoryAddress || !dpTokenAddress || !devicePassword) {
    return res.status(500).json({
      success: false,
      message:
        "Server configuration error: contract addresses or device password not set.",
    });
  }

  try {
    // 1. 보안 채널 생성 및 사용자 기본 정보 조회
    const secureChannel = await authService.createSecureChannel();
    const walletInfo = await walletService.getWallet(accessToken);
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      devicePassword
    );
    const fullWalletData = await walletService.createWallet(
      walletInfo.email,
      encryptedDevicePassword,
      secureChannel.ChannelID,
      accessToken
    );

    // 2. 사용자의 SBT 목록을 조회하고 artist 또는 brand 타입의 SBT가 있는지 확인
    const sbtInfoList = await creatorSBTContract.methods
      .getSBTInfoByAddress(walletInfo.address)
      .call();

    // DP 토큰 잔액 확인 (1 DP만 있으면 됨)
    const oneDPWei = web3.utils.toWei("1", "ether");
    const dpBalance = await dpTokenContract.methods
      .balanceOf(walletInfo.address)
      .call();
    if (BigInt(dpBalance) < BigInt(oneDPWei)) {
      return res.status(403).json({
        success: false,
        message: `DP 토큰 잔액이 부족합니다. 현재 잔액: ${web3.utils.fromWei(
          dpBalance,
          "ether"
        )} DP, 필요한 금액: 1 DP`,
        code: "INSUFFICIENT_DP_BALANCE",
      });
    }

    let creatorSBTId = null;
    const allowedTypes = ["artist", "brand"];

    // 입력된 creatorType을 정규화 (따옴표 제거 및 소문자 변환)
    const normalizedCreatorType = creatorType
      .toLowerCase()
      .replace(/['"]+/g, "");

    // 먼저 요청한 creatorType이 허용된 타입인지 확인
    if (!allowedTypes.includes(normalizedCreatorType)) {
      return res.status(403).json({
        success: false,
        message: `Invalid creator type. Only ${allowedTypes.join(
          " or "
        )} can mint IPNFT.`,
      });
    }

    // 요청한 creatorType의 SBT를 가지고 있는지 확인
    for (const sbtInfo of sbtInfoList) {
      if (sbtInfo.creatorType.toLowerCase() === normalizedCreatorType) {
        creatorSBTId = sbtInfo.tokenId;
        break;
      }
    }

    if (creatorSBTId === null) {
      return res.status(403).json({
        success: false,
        message: `You don't have the required ${normalizedCreatorType} SBT to mint this IPNFT. Only artist or brand SBT holders can mint IPNFT.`,
      });
    }

    // 3. DP 토큰 Approve 트랜잭션 처리
    logger.info(`Approving DP token for ${walletInfo.address}...`);
    const approveTxData = dpTokenContract.methods
      .approve(ipnftFactoryAddress, web3.utils.toWei("1", "ether"))
      .encodeABI();

    const approveTx = {
      to: dpTokenContract.options.address,
      value: "0",
      data: approveTxData,
    };

    const signedApproveTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      approveTx,
      accessToken
    );
    const approveReceipt = await web3.eth.sendSignedTransaction(
      signedApproveTx
    );
    logger.info(
      `DP Token approved. Tx Hash: ${approveReceipt.transactionHash}`
    );

    // 4. IPNFT 토큰 생성 트랜잭션 처리
    logger.info(`Creating token for ${walletInfo.address}...`);
    const createTokenTxData = ipnftFactoryContract.methods
      .createToken(
        ipfsImage,
        name,
        description,
        priceInWei,
        supplyPriceInWei,
        creatorSBTId
      )
      .encodeABI();

    const createTokenTx = {
      to: ipnftFactoryAddress,
      value: "0",
      data: createTokenTxData,
    };

    const signedCreateTokenTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      createTokenTx,
      accessToken
    );
    const createTokenReceipt = await web3.eth.sendSignedTransaction(
      signedCreateTokenTx
    );
    logger.info(
      `Token created. Tx Hash: ${createTokenReceipt.transactionHash}`
    );

    // 5. 결과 반환 (이벤트에서 tokenId 추출)
    const decodedLogs = await ipnftFactoryContract.getPastEvents(
      "TokenMinted",
      {
        fromBlock: createTokenReceipt.blockNumber,
        toBlock: createTokenReceipt.blockNumber,
      }
    );

    // 직접 트랜잭션 영수증에서 이벤트 로그 확인
    let tokenId = null;
    if (decodedLogs.length === 0) {
      // 트랜잭션 영수증에서 직접 이벤트 로그 파싱
      const logs = createTokenReceipt.logs;
      for (const log of logs) {
        if (log.address.toLowerCase() === ipnftFactoryAddress.toLowerCase()) {
          try {
            const decodedLog = web3.eth.abi.decodeLog(
              [
                {
                  type: "uint256",
                  name: "tokenId",
                  indexed: true,
                },
                {
                  type: "address",
                  name: "creator",
                  indexed: true,
                },
                {
                  type: "uint256",
                  name: "creatorSBTId",
                },
                {
                  type: "string",
                  name: "name",
                },
                {
                  type: "string",
                  name: "symbol",
                },
              ],
              log.data,
              log.topics.slice(1) // 첫 번째 topic은 이벤트 시그니처
            );
            tokenId = decodedLog.tokenId;
            break;
          } catch (e) {
            console.log("Failed to decode log:", e);
          }
        }
      }
    } else {
      tokenId = decodedLogs[0].returnValues.tokenId;
    }

    const ipnftAddress = await ipnftFactoryContract.methods
      .getIPNFTAddress()
      .call();

    if (!tokenId) {
      // 토큰 ID를 찾을 수 없는 경우, 현재 토큰 ID를 조회
      const ipnftContract = new web3.eth.Contract(IPNFTABI, ipnftAddress);
      const currentTokenId = await ipnftContract.methods
        .getCurrentTokenId()
        .call();
      tokenId = String(Number(currentTokenId) - 1);
    }

    // BigInt를 문자열로 변환
    tokenId = String(tokenId);

    return res.json({
      success: true,
      ipnftAddress,
      tokenId,
      txHash: createTokenReceipt.transactionHash,
      message: "IPNFT token successfully created",
    });
  } catch (error) {
    logger.error("IPNFT mint error:", error);

    if (error.code === "TOKEN_EXPIRED") {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message:
          "Access token has expired. Please refresh your token and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mint IPNFT",
    });
  }
};

/**
 * IPNFT 전체 목록 조회
 * @route GET /api/nft/ip/list
 * @desc 모든 IPNFT를 조회
 */
exports.list = async (req, res) => {
  try {
    // IPNFT 컨트랙트 주소 조회
    const ipnftAddress = await ipnftFactoryContract.methods
      .getIPNFTAddress()
      .call();
    const ipnftContract = new web3.eth.Contract(IPNFTABI, ipnftAddress);

    // 현재 토큰 ID 조회
    const currentTokenId = await ipnftContract.methods
      .getCurrentTokenId()
      .call();

    let result = [];
    for (let tokenId = 0; tokenId < Number(currentTokenId); tokenId++) {
      try {
        // 토큰이 존재하는지 확인
        const exists = await ipnftContract.methods
          ._existsPublic(tokenId)
          .call();
        if (!exists) continue;

        const owner = await ipnftContract.methods.ownerOf(tokenId).call();
        const tokenInfo = await ipnftContract.methods
          .getTokenInfo(tokenId)
          .call();
        let creatorSBT = null;

        try {
          logger.info(`Fetching SBT info for creator: ${tokenInfo.creator}`);
          const sbtInfoList = await creatorSBTContract.methods
            .getSBTInfoByAddress(tokenInfo.creator)
            .call();

          creatorSBT = sbtInfoList.find(
            (sbt) => sbt.tokenId === tokenInfo.creatorSBTId
          );
          logger.info(`Successfully retrieved SBT info:`, creatorSBT);
        } catch (e) {
          logger.error(
            `Failed to get SBT info for creator ${tokenInfo.creator}:`,
            e
          );
        }

        result.push({
          contract: ipnftAddress,
          tokenId,
          ...cleanTokenInfo(tokenInfo),
          creator: tokenInfo.creator,
          creatorSBTId: tokenInfo.creatorSBTId,
          creatorSBT: cleanSBT(creatorSBT),
          owner,
        });
      } catch (e) {
        logger.error(`Failed to get token info for tokenId ${tokenId}:`, e);
        continue;
      }
    }

    return res.json({ success: true, data: stringifyBigInts(result) });
  } catch (err) {
    logger.error("IPNFT list error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 내가 소유한 IPNFT 목록 조회
 * @route GET /api/nft/ip/my
 * @desc 현재 로그인한 사용자가 소유한 IPNFT만 조회
 */
exports.getMyIPNFTs = async (req, res) => {
  try {
    // accessToken에서 walletAddress 추출
    const walletInfo = await walletService.getWallet(req.token);
    const walletAddress = walletInfo.address;

    if (!walletAddress) {
      return res.status(401).json({
        success: false,
        message: "No wallet address found from accessToken.",
      });
    }

    // IPNFT 컨트랙트 주소 조회
    const ipnftAddress = await ipnftFactoryContract.methods
      .getIPNFTAddress()
      .call();
    const ipnftContract = new web3.eth.Contract(IPNFTABI, ipnftAddress);

    // 현재 토큰 ID 조회
    const currentTokenId = await ipnftContract.methods
      .getCurrentTokenId()
      .call();

    let result = [];
    for (let tokenId = 0; tokenId < Number(currentTokenId); tokenId++) {
      try {
        // 토큰이 존재하는지 확인
        const exists = await ipnftContract.methods
          ._existsPublic(tokenId)
          .call();
        if (!exists) continue;

        const owner = await ipnftContract.methods.ownerOf(tokenId).call();

        // 현재 사용자가 소유한 토큰만 필터링
        if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
          continue;
        }

        const tokenInfo = await ipnftContract.methods
          .getTokenInfo(tokenId)
          .call();
        let creatorSBT = null;

        try {
          logger.info(`Fetching SBT info for creator: ${tokenInfo.creator}`);
          const sbtInfoList = await creatorSBTContract.methods
            .getSBTInfoByAddress(tokenInfo.creator)
            .call();

          creatorSBT = sbtInfoList.find(
            (sbt) => sbt.tokenId === tokenInfo.creatorSBTId
          );
          logger.info(`Successfully retrieved SBT info:`, creatorSBT);
        } catch (e) {
          logger.error(
            `Failed to get SBT info for creator ${tokenInfo.creator}:`,
            e
          );
        }

        result.push({
          contract: ipnftAddress,
          tokenId,
          ...cleanTokenInfo(tokenInfo),
          creator: tokenInfo.creator,
          creatorSBTId: tokenInfo.creatorSBTId,
          creatorSBT: cleanSBT(creatorSBT),
          owner,
        });
      } catch (e) {
        logger.error(`Failed to get token info for tokenId ${tokenId}:`, e);
        continue;
      }
    }

    return res.json({ success: true, data: stringifyBigInts(result) });
  } catch (err) {
    logger.error("IPNFT list error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// TokenInfo 정보 정리
function cleanTokenInfo(tokenInfo) {
  // 앞뒤에 쌍따옴표가 있으면 제거
  const stripQuotes = (v) =>
    typeof v === "string" && v.startsWith('"') && v.endsWith('"')
      ? v.slice(1, -1)
      : v;

  // IPFS URI를 HTTP URL로 변환
  const convertIpfsUri = (uri) => {
    if (!uri) return uri;
    if (uri.startsWith("ipfs://")) {
      return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
    }
    return uri;
  };

  // BigInt를 문자열로 변환
  const convertBigInt = (value) => {
    if (typeof value === "bigint" || value?._isBigNumber) {
      return String(value);
    }
    return value;
  };

  return {
    ipfsImage: convertIpfsUri(tokenInfo.ipfsImage),
    name: stripQuotes(tokenInfo.name),
    description: stripQuotes(tokenInfo.description),
    price: convertBigInt(tokenInfo.price),
    supplyPrice: convertBigInt(tokenInfo.supplyPrice),
    createdAt: convertBigInt(tokenInfo.createdAt),
  };
}

// SBT 정보 정리
function cleanSBT(sbt) {
  if (!sbt) return null;

  const normalizedCreatorType = sbt.creatorType
    ? sbt.creatorType.toLowerCase().replace(/['"]+/g, "")
    : null;

  // BigInt를 문자열로 변환
  const convertBigInt = (value) => {
    if (typeof value === "bigint" || value?._isBigNumber) {
      return String(value);
    }
    return value;
  };

  return {
    tokenId: convertBigInt(sbt.tokenId),
    owner: sbt.owner,
    creatorType: normalizedCreatorType,
    creatorName: sbt.creatorName,
    description: sbt.description,
    tokenUri: sbt.tokenUri,
    useCount: convertBigInt(sbt.useCount),
  };
}
