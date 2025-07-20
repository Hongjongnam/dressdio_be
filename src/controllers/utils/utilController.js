const {
  web3,
  sbtContract,
  dpTokenContract,
  ipnftFactoryContract,
  platformRegistryContract,
  creatorSBTContract,
  IPNFTABI, // IPNFT ABI 추가
} = require("../../config/web3");
const { uploadFileToIPFS, uploadJSONToIPFS } = require("../../services/upload");
const { stringifyBigInts } = require("../../utils/utils");
const authService = require("../../services/auth");
const walletService = require("../../services/wallet");
const blockchainService = require("../../services/blockchain");
const logger = require("../../utils/logger");

// faucet에서만 직접 .env의 DRESSDIO_ADMIN_WALLET_ADDRESS, DRESSDIO_ADMIN_PRIVATE_KEY 사용
const FAUCET_ADMIN_ADDRESS = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;
const FAUCET_ADMIN_PRIVATE_KEY = process.env.DRESSDIO_ADMIN_PRIVATE_KEY;

let faucetLock = false;

exports.faucet = async (req, res) => {
  if (faucetLock) {
    return res.status(429).json({
      success: false,
      message:
        "다른 에어드랍 트랜잭션이 처리 중입니다. 잠시 후 다시 시도하세요.",
    });
  }
  faucetLock = true;
  try {
    const { walletAddress, amount } = req.body;
    if (!walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: "Wallet address and amount are required.",
      });
    }

    const receipt = await blockchainService.transferDP(
      walletAddress,
      web3.utils.toWei(amount.toString(), "ether")
    );
    res.json({
      success: true,
      message: "DP tokens transferred successfully.",
      data: {
        to: walletAddress,
        amount: amount,
        receipt: stringifyBigInts(receipt),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    faucetLock = false;
  }
};

// POST /api/utils/ipfs/upload-file
exports.uploadFileToIPFS = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "업로드할 파일을 선택해주세요.",
      });
    }

    const file = req.file;
    console.log("IPFS 파일 업로드 시작:", {
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // 파일 업로드
    const ipfsUri = await uploadFileToIPFS(file.buffer, file.originalname);

    // HTTP URL로도 변환해서 제공
    const httpUrl = ipfsUri.replace("ipfs://", "https://ipfs.io/ipfs/");

    console.log("IPFS 파일 업로드 완료:", {
      ipfsUri,
      httpUrl,
    });

    return res.json({
      success: true,
      message: "파일이 IPFS에 성공적으로 업로드되었습니다.",
      data: {
        ipfsUri,
        httpUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error) {
    console.error("IPFS 파일 업로드 오류:", error);
    return res.status(500).json({
      success: false,
      message: "IPFS 업로드 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// POST /api/utils/ipfs/upload-json
exports.uploadJSONToIPFS = async (req, res) => {
  try {
    const { jsonData } = req.body;

    if (!jsonData) {
      return res.status(400).json({
        success: false,
        message: "업로드할 JSON 데이터를 입력해주세요.",
      });
    }

    // JSON 데이터 파싱 및 검증
    let parsedData;
    try {
      parsedData =
        typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: "유효한 JSON 형식이 아닙니다.",
        error: parseError.message,
      });
    }

    console.log("IPFS JSON 업로드 시작:", {
      dataType: typeof parsedData,
      keys: Object.keys(parsedData),
    });

    // JSON 업로드
    const ipfsUri = await uploadJSONToIPFS(parsedData);

    // HTTP URL로도 변환해서 제공
    const httpUrl = ipfsUri.replace("ipfs://", "https://ipfs.io/ipfs/");

    console.log("IPFS JSON 업로드 완료:", {
      ipfsUri,
      httpUrl,
    });

    return res.json({
      success: true,
      message: "JSON 데이터가 IPFS에 성공적으로 업로드되었습니다.",
      data: {
        ipfsUri,
        httpUrl,
        uploadedData: parsedData,
      },
    });
  } catch (error) {
    console.error("IPFS JSON 업로드 오류:", error);
    return res.status(500).json({
      success: false,
      message: "IPFS 업로드 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

const debugIpNftState = async (req, res) => {
  const { tokenId } = req.params;
  const logs = [];
  let ipnftContract;

  const log = (message, data = "") => {
    const logMessage = `[Debug IPNFT ${tokenId}] ${message}`;
    console.log(logMessage, data);
    logs.push({ message: logMessage, data: stringifyBigInts(data) });
  };

  try {
    // 1. IPNFT 컨트랙트 인스턴스 가져오기
    try {
      const ipnftAddress = await ipnftFactoryContract.methods
        .getIPNFTAddress()
        .call();
      log("Successfully fetched IPNFT contract address:", ipnftAddress);
      ipnftContract = new web3.eth.Contract(IPNFTABI, ipnftAddress);
    } catch (e) {
      log("❌ FAILED to get IPNFT contract address.", e.message);
      return res.status(500).json({ success: false, logs });
    }

    // 2. PlatformRegistry에 토큰이 등록되었는지 확인
    try {
      const isRegistered = await platformRegistryContract.methods
        .validIPNFTTokenIds(tokenId)
        .call();
      log(`Is token registered in PlatformRegistry?`, isRegistered);
      if (!isRegistered) {
        log(
          "❌ CRITICAL: Token is not registered in PlatformRegistry. This is a likely cause of failure."
        );
      }
    } catch (e) {
      log(
        "❌ FAILED to check token registration in PlatformRegistry.",
        e.message
      );
    }

    // 3. IPNFT 컨트랙트에서 토큰 정보 조회
    let tokenInfo;
    try {
      tokenInfo = await ipnftContract.methods.getTokenInfo(tokenId).call();
      log("Successfully fetched token info from IPNFT contract:", tokenInfo);
    } catch (e) {
      log(
        "❌ FAILED to get token info from IPNFT contract. This might be the root cause of the revert.",
        e.message
      );
      return res.status(500).json({ success: false, logs });
    }

    // 4. CreatorSBT 컨트랙트에서 SBT 정보 조회
    try {
      const { creator, creatorSBTId } = tokenInfo;
      log(
        `Fetching SBT info for creator ${creator} with SBT ID ${creatorSBTId}`
      );
      const sbtInfo = await creatorSBTContract.methods
        .getSBTInfoById(creatorSBTId)
        .call();
      log("Successfully fetched SBT info:", sbtInfo);
    } catch (e) {
      log("❌ FAILED to get SBT info from CreatorSBT contract.", e.message);
    }

    // 5. PlatformRegistry에서 Brand 유효성 검증
    try {
      const isBrand = await platformRegistryContract.methods
        .validateBrandIPNFT(tokenId)
        .call();
      log("Result of validateBrandIPNFT:", isBrand);
    } catch (e) {
      log("❌ FAILED to execute validateBrandIPNFT.", e.message);
    }

    // 6. PlatformRegistry에서 Artist 유효성 검증
    try {
      const isArtist = await platformRegistryContract.methods
        .validateArtistIPNFT(tokenId)
        .call();
      log("Result of validateArtistIPNFT:", isArtist);
    } catch (e) {
      log("❌ FAILED to execute validateArtistIPNFT.", e.message);
    }

    res.json({
      success: true,
      message: "Debug check complete. See server logs for details.",
      logs,
    });
  } catch (error) {
    log("An unexpected error occurred during debug check.", error.message);
    res.status(500).json({ success: false, logs });
  }
};

module.exports = {
  faucet: exports.faucet,
  uploadFileToIPFS: exports.uploadFileToIPFS,
  uploadJSONToIPFS: exports.uploadJSONToIPFS,
  debugIpNftState,
};
