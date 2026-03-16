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
const mpcService = require("../../services/blockchainMPC");
const logger = require("../../utils/logger");

// faucet에서만 직접 .env의 DRESSDIO_ADMIN_WALLET_ADDRESS, DRESSDIO_ADMIN_PRIVATE_KEY 사용
const FAUCET_ADMIN_ADDRESS = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;
const FAUCET_ADMIN_PRIVATE_KEY = process.env.DRESSDIO_ADMIN_PRIVATE_KEY;

// DP Token 주소 (Besu)
const DP_TOKEN_ADDRESS = process.env.DP_TOKEN_ADDRESS;

// Dress Token 주소 (Polygon)
const POLYGON_DRESS_TOKEN_ADDRESS = process.env.POLYGON_DRESS_TOKEN_ADDRESS;

// Polygon RPC URL
const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";

// Platform Admin Wallet (Polygon) - Swap 수신 지갑
const PLATFORM_ADMIN_WALLET =
  process.env.DRESSDIO_ADMIN_WALLET_ADDRESS ||
  "0x4c7e5b905266dBA906645a7659038660Bd4674db";

// Swap Rate: DRESS → DP (1:5)
const SWAP_RATE = 5;

let faucetLock = false;

/**
 * Polygon Dress Token 잔액 조회
 * GET /api/utils/dress-token/balance
 */
exports.getDressTokenBalance = async (req, res) => {
  try {
    const accessToken = req.token;

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "액세스 토큰이 필요합니다.",
      });
    }

    logger.info("[DRESS_TOKEN/BALANCE] Fetching Dress Token balance");

    // 1. Access Token으로 지갑 주소 가져오기
    const walletInfo = await walletService.getWallet(accessToken);

    if (!walletInfo || !walletInfo.address) {
      return res.status(404).json({
        success: false,
        message: "지갑 주소를 찾을 수 없습니다.",
      });
    }

    const walletAddress = walletInfo.address;
    logger.info("[DRESS_TOKEN/BALANCE] Wallet address:", walletAddress);

    // 2. Polygon 네트워크에서 Dress Token 잔액 조회
    const { Web3 } = require("web3");
    const polygonWeb3 = new Web3(POLYGON_RPC_URL);

    // ERC20 balanceOf ABI
    const erc20BalanceAbi = [
      {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
      },
      {
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        type: "function",
      },
      {
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [{ name: "", type: "string" }],
        type: "function",
      },
      {
        constant: true,
        inputs: [],
        name: "name",
        outputs: [{ name: "", type: "string" }],
        type: "function",
      },
    ];

    const dressTokenContract = new polygonWeb3.eth.Contract(
      erc20BalanceAbi,
      POLYGON_DRESS_TOKEN_ADDRESS
    );

    // 3. 병렬로 정보 조회
    const [balance, decimals, symbol, name, maticBalance] = await Promise.all([
      dressTokenContract.methods.balanceOf(walletAddress).call(),
      dressTokenContract.methods.decimals().call(),
      dressTokenContract.methods.symbol().call(),
      dressTokenContract.methods.name().call(),
      polygonWeb3.eth.getBalance(walletAddress), // MATIC 잔액도 함께 조회
    ]);

    // 4. Wei -> Ether 변환
    const balanceInEther = polygonWeb3.utils.fromWei(
      balance.toString(),
      "ether"
    );
    const maticBalanceInEther = polygonWeb3.utils.fromWei(
      maticBalance.toString(),
      "ether"
    );

    logger.info("[DRESS_TOKEN/BALANCE] Balance retrieved successfully:", {
      walletAddress,
      balance: balanceInEther,
      maticBalance: maticBalanceInEther,
    });

    return res.json({
      success: true,
      message: "Dress Token 잔액을 성공적으로 조회했습니다.",
      data: {
        walletAddress,
        token: {
          name,
          symbol,
          decimals: decimals.toString(),
          contractAddress: POLYGON_DRESS_TOKEN_ADDRESS,
          balance: balanceInEther,
          balanceWei: balance.toString(),
        },
        matic: {
          balance: maticBalanceInEther,
          balanceWei: maticBalance.toString(),
          warning:
            parseFloat(maticBalanceInEther) < 0.001
              ? "가스비(MATIC)가 부족합니다. 전송하려면 최소 0.1 MATIC이 필요합니다."
              : null,
        },
        network: "Polygon",
        rpcUrl: POLYGON_RPC_URL,
      },
    });
  } catch (error) {
    logger.error("[DRESS_TOKEN/BALANCE] Error:", error);

    // RPC 연결 오류
    if (
      error.message.includes("Invalid response") ||
      error.message.includes("connection") ||
      error.message.includes("timeout")
    ) {
      return res.status(503).json({
        success: false,
        message:
          "Polygon 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        error: "NETWORK_ERROR",
      });
    }

    // 지갑 조회 실패
    if (error.message.includes("지갑")) {
      return res.status(404).json({
        success: false,
        message: error.message,
        error: "WALLET_NOT_FOUND",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Dress Token 잔액 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * Dress Token → DP Token Swap (1:5)
 * POST /api/utils/swap-dress-to-dp
 *
 * 사용자가 Dress Token을 플랫폼 어드민 지갑으로 전송한 후,
 * 이 API를 호출하면 전송한 DRESS 수량 × 5배의 DP 토큰을 받습니다.
 */
exports.swapDressToDp = async (req, res) => {
  try {
    const { txHash, fromAddress } = req.body;

    if (!txHash || !fromAddress) {
      return res.status(400).json({
        success: false,
        message: "트랜잭션 해시(txHash)와 전송 주소(fromAddress)가 필요합니다.",
      });
    }

    logger.info("[SWAP] Starting Dress → DP swap verification", {
      txHash,
      fromAddress,
    });

    // 1. Polygon 네트워크에서 트랜잭션 확인
    const { Web3 } = require("web3");
    const polygonWeb3 = new Web3(POLYGON_RPC_URL);

    const tx = await polygonWeb3.eth.getTransaction(txHash);
    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "트랜잭션을 찾을 수 없습니다.",
        error: "TRANSACTION_NOT_FOUND",
      });
    }

    logger.info("[SWAP] Transaction found:", {
      from: tx.from,
      to: tx.to,
      blockNumber: tx.blockNumber,
    });

    // 2. 트랜잭션 검증
    // 2-1. 보낸 주소 확인
    if (tx.from.toLowerCase() !== fromAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "트랜잭션 발신자가 일치하지 않습니다.",
        error: "SENDER_MISMATCH",
        details: {
          expected: fromAddress,
          actual: tx.from,
        },
      });
    }

    // 2-2. 받는 주소가 Dress Token 컨트랙트인지 확인 (ERC20 transfer)
    if (tx.to.toLowerCase() !== POLYGON_DRESS_TOKEN_ADDRESS.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Dress Token 컨트랙트로의 트랜잭션이 아닙니다.",
        error: "INVALID_CONTRACT",
        details: {
          expected: POLYGON_DRESS_TOKEN_ADDRESS,
          actual: tx.to,
        },
      });
    }

    // 2-3. 트랜잭션 receipt로 실제 전송 확인
    const receipt = await polygonWeb3.eth.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.status(400).json({
        success: false,
        message: "트랜잭션이 아직 컨펌되지 않았습니다.",
        error: "TRANSACTION_PENDING",
      });
    }

    if (!receipt.status) {
      return res.status(400).json({
        success: false,
        message: "트랜잭션이 실패했습니다.",
        error: "TRANSACTION_FAILED",
      });
    }

    // 2-4. Transfer 이벤트 파싱하여 수량 및 받는 주소 확인
    const transferEventSignature = polygonWeb3.utils.keccak256(
      "Transfer(address,address,uint256)"
    );

    const transferLog = receipt.logs.find(
      (log) =>
        log.topics[0] === transferEventSignature &&
        log.address.toLowerCase() === POLYGON_DRESS_TOKEN_ADDRESS.toLowerCase()
    );

    if (!transferLog) {
      return res.status(400).json({
        success: false,
        message: "Dress Token Transfer 이벤트를 찾을 수 없습니다.",
        error: "TRANSFER_EVENT_NOT_FOUND",
      });
    }

    // 이벤트 데이터 디코딩
    const toAddress = "0x" + transferLog.topics[2].slice(26); // Remove padding
    const dressAmount = BigInt(transferLog.data);

    logger.info("[SWAP] Transfer event decoded:", {
      from: fromAddress,
      to: toAddress,
      amount: dressAmount.toString(),
    });

    // 2-5. 받는 주소가 플랫폼 어드민 지갑인지 확인
    if (toAddress.toLowerCase() !== PLATFORM_ADMIN_WALLET.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "플랫폼 어드민 지갑으로 전송된 트랜잭션이 아닙니다.",
        error: "INVALID_RECIPIENT",
        details: {
          expected: PLATFORM_ADMIN_WALLET,
          actual: toAddress,
        },
      });
    }

    // 3. DP Token 수량 계산 (DRESS × 5)
    const dressAmountInEther = polygonWeb3.utils.fromWei(
      dressAmount.toString(),
      "ether"
    );
    const dpAmount = parseFloat(dressAmountInEther) * SWAP_RATE;

    logger.info("[SWAP] Calculated DP amount:", {
      dressAmount: dressAmountInEther,
      swapRate: SWAP_RATE,
      dpAmount,
    });

    // 4. DP Token 전송 (Faucet 패턴 사용)
    logger.info("[SWAP] Sending DP tokens to user...");
    const dpAmountInWei = web3.utils.toWei(dpAmount.toString(), "ether");

    const dpReceipt = await blockchainService.transferDP(
      fromAddress,
      dpAmountInWei
    );

    logger.info("[SWAP] Swap completed successfully", {
      dressTxHash: txHash,
      dpTxHash: dpReceipt.transactionHash,
      dressAmount: dressAmountInEther,
      dpAmount,
    });

    return res.json({
      success: true,
      message: `Dress Token ${dressAmountInEther} DRESS → DP Token ${dpAmount} DP 스왑이 완료되었습니다.`,
      data: {
        swap: {
          dressAmount: dressAmountInEther,
          dpAmount: dpAmount.toString(),
          swapRate: SWAP_RATE,
        },
        polygon: {
          txHash: txHash,
          from: fromAddress,
          to: PLATFORM_ADMIN_WALLET,
          blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
        },
        besu: {
          txHash: dpReceipt.transactionHash,
          from: FAUCET_ADMIN_ADDRESS,
          to: fromAddress,
          blockNumber: dpReceipt.blockNumber
            ? Number(dpReceipt.blockNumber)
            : null,
        },
      },
    });
  } catch (error) {
    logger.error("[SWAP] Error:", error);

    // RPC 연결 오류
    if (
      error.message.includes("Invalid response") ||
      error.message.includes("connection") ||
      error.message.includes("timeout")
    ) {
      return res.status(503).json({
        success: false,
        message: "네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        error: "NETWORK_ERROR",
      });
    }

    return res.status(500).json({
      success: false,
      message: "스왑 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

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

/**
 * DP 토큰 전송 (MPC 패턴 - Merchandise 프로젝트 활성화와 동일)
 * @param {Object} req - Express request object
 * @param {string} req.body.to - 받는 주소
 * @param {string} req.body.amount - 전송 수량 (DP)
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
exports.transferDPToken = async (req, res) => {
  const { to, amount, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (!to || !amount || !devicePassword || !storedWalletData) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    // 1. 주소 형식 검증
    if (!web3.utils.isAddress(to)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 주소 형식입니다.",
      });
    }

    // 2. 전송 금액을 Wei로 변환
    const amountInWei = web3.utils.toWei(amount.toString(), "ether");

    logger.info("[DP_TOKEN/TRANSFER] Starting DP token transfer:", {
      from: storedWalletData.sid,
      to,
      amount,
      amountInWei,
    });

    // 3. ERC20 transfer 트랜잭션 데이터 생성 (Merchandise 활성화와 동일한 패턴)
    const txData = {
      to: DP_TOKEN_ADDRESS,
      data: dpTokenContract.methods.transfer(to, amountInWei).encodeABI(),
      value: "0",
    };

    // 4. MPC 서비스로 트랜잭션 실행 (Merchandise 활성화와 동일)
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    logger.info("[DP_TOKEN/TRANSFER] Transfer successful:", {
      txHash: receipt.transactionHash,
      from: storedWalletData.sid,
      to,
      amount,
    });

    return res.json({
      success: true,
      message: "DP 토큰이 성공적으로 전송되었습니다.",
      data: {
        txHash: receipt.transactionHash,
        from: storedWalletData.sid,
        to,
        amount,
        contractAddress: DP_TOKEN_ADDRESS,
      },
    });
  } catch (error) {
    logger.error("[DP_TOKEN/TRANSFER] Error:", error);

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
      message: "DP 토큰 전송 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

/**
 * Dress 토큰 전송 (Polygon, MPC 패턴 - DP 토큰 전송과 동일)
 * @param {Object} req - Express request object
 * @param {string} req.body.to - 받는 주소
 * @param {string} req.body.amount - 전송 수량 (DRESS)
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {Object} res - Express response object
 */
exports.transferDressToken = async (req, res) => {
  const { to, amount, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (!to || !amount || !devicePassword || !storedWalletData) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    // 1. 주소 형식 검증
    if (!web3.utils.isAddress(to)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 주소 형식입니다.",
      });
    }

    // 2. 전송 금액을 Wei로 변환 (Dress Token은 18 decimals)
    const amountInWei = web3.utils.toWei(amount.toString(), "ether");

    logger.info("[DRESS_TOKEN/TRANSFER] Starting Dress token transfer:", {
      from: storedWalletData.sid,
      to,
      amount,
      amountInWei,
    });

    // 2-1. 사전 검증: Polygon에서 MATIC 잔액 확인 (선택적 - 성능을 위해 주석 처리 가능)
    try {
      const { Web3 } = require("web3");
      const POLYGON_RPC_URL =
        process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
      const polygonWeb3 = new Web3(POLYGON_RPC_URL);

      const maticBalance = await polygonWeb3.eth.getBalance(
        storedWalletData.sid
      );
      const maticBalanceInEther = polygonWeb3.utils.fromWei(
        maticBalance,
        "ether"
      );

      logger.info("[DRESS_TOKEN/TRANSFER] Pre-transfer balance check:", {
        maticBalance: maticBalanceInEther + " MATIC",
      });

      // MATIC이 거의 없으면 경고 (하지만 계속 진행)
      if (parseFloat(maticBalanceInEther) < 0.001) {
        logger.warn(
          "[DRESS_TOKEN/TRANSFER] Low MATIC balance detected. Transaction may fail due to insufficient gas."
        );
      }
    } catch (balanceCheckError) {
      // 잔액 확인 실패해도 계속 진행 (RPC 오류 등)
      logger.warn(
        "[DRESS_TOKEN/TRANSFER] Balance pre-check failed, continuing anyway:",
        balanceCheckError.message
      );
    }

    // 3. ERC20 transfer 트랜잭션 데이터 생성 (DP Token과 동일한 패턴)
    // Polygon 네트워크에 배포된 Dress Token 컨트랙트도 동일한 ERC20 인터페이스 사용
    const transferData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transfer",
        type: "function",
        inputs: [
          { type: "address", name: "to" },
          { type: "uint256", name: "amount" },
        ],
      },
      [to, amountInWei]
    );

    const txData = {
      to: POLYGON_DRESS_TOKEN_ADDRESS,
      data: transferData,
      value: "0",
    };

    // 4. Polygon 전용 MPC 서비스로 트랜잭션 실행
    // DP Token(Besu)과 달리 Dress Token(Polygon)은 가스비가 있으므로
    // executeTransactionWithStoredDataForPolygon 사용 (EIP-1559 지원)
    const receipt = await mpcService.executeTransactionWithStoredDataForPolygon(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    const polygonTxHash = receipt.transactionHash;

    logger.info("[DRESS_TOKEN/TRANSFER] Transfer successful:", {
      txHash: polygonTxHash,
      from: storedWalletData.sid,
      to,
      amount,
    });

    // 5. 받는 주소가 플랫폼 어드민 지갑인 경우 자동으로 DP Token 지급
    const isPlatformWallet =
      to.toLowerCase() === PLATFORM_ADMIN_WALLET.toLowerCase();

    if (isPlatformWallet) {
      logger.info(
        "[DRESS_TOKEN/TRANSFER] Platform wallet detected, initiating automatic DP swap with verification..."
      );

      try {
        // === 검증 시작: Transfer 이벤트 파싱 ===
        const { Web3 } = require("web3");
        const polygonWeb3 = new Web3(POLYGON_RPC_URL);

        // 트랜잭션 receipt 가져오기 (이미 실행되었으므로 바로 조회 가능)
        const txReceipt = await polygonWeb3.eth.getTransactionReceipt(
          polygonTxHash
        );
        if (!txReceipt || !txReceipt.status) {
          throw new Error("Transaction receipt not found or failed");
        }

        // Transfer 이벤트 파싱
        const transferEventSignature = polygonWeb3.utils.keccak256(
          "Transfer(address,address,uint256)"
        );

        const transferLog = txReceipt.logs.find(
          (log) =>
            log.topics[0] === transferEventSignature &&
            log.address.toLowerCase() ===
              POLYGON_DRESS_TOKEN_ADDRESS.toLowerCase()
        );

        if (!transferLog) {
          throw new Error("Transfer event not found in transaction logs");
        }

        // 실제 전송된 금액 파싱 (Wei 단위)
        const actualDressAmountWei = BigInt(transferLog.data);
        const actualDressAmount = polygonWeb3.utils.fromWei(
          actualDressAmountWei.toString(),
          "ether"
        );

        logger.info("[DRESS_TOKEN/TRANSFER] Verified transfer amount:", {
          inputAmount: amount,
          actualAmount: actualDressAmount,
          verified: true,
        });

        // DP Token 수량 계산 (실제 전송된 금액 기준 × 5)
        const dpAmount = parseFloat(actualDressAmount) * SWAP_RATE;
        const dpAmountInWei = web3.utils.toWei(dpAmount.toString(), "ether");

        logger.info("[DRESS_TOKEN/TRANSFER] Calculated DP amount:", {
          dressAmount: actualDressAmount,
          swapRate: SWAP_RATE,
          dpAmount,
        });

        // DP Token 전송 (Faucet 패턴)
        const dpReceipt = await blockchainService.transferDP(
          storedWalletData.sid,
          dpAmountInWei
        );

        logger.info("[DRESS_TOKEN/TRANSFER] DP Token swap completed:", {
          dressTxHash: polygonTxHash,
          dpTxHash: dpReceipt.transactionHash,
          dressAmount: actualDressAmount,
          dpAmount,
        });

        // 플랫폼 전송 + 자동 스왑 성공 응답
        return res.json({
          success: true,
          message: `✅ 완료! ${actualDressAmount} DRESS → ${dpAmount} DP 스왑이 완료되었습니다.`,
          data: {
            transfer: {
              txHash: polygonTxHash,
              from: storedWalletData.sid,
              to,
              amount: actualDressAmount,
              contractAddress: POLYGON_DRESS_TOKEN_ADDRESS,
              network: "polygon",
            },
            swap: {
              dressAmount: actualDressAmount,
              dpAmount: dpAmount.toString(),
              swapRate: SWAP_RATE,
              automatic: true,
              verified: true,
              reason: "Platform wallet detected",
            },
            polygon: {
              txHash: polygonTxHash,
              from: storedWalletData.sid,
              to: PLATFORM_ADMIN_WALLET,
              blockNumber: txReceipt.blockNumber
                ? Number(txReceipt.blockNumber)
                : null,
              network: "Polygon",
            },
            besu: {
              txHash: dpReceipt.transactionHash,
              from: FAUCET_ADMIN_ADDRESS,
              to: storedWalletData.sid,
              blockNumber: dpReceipt.blockNumber
                ? Number(dpReceipt.blockNumber)
                : null,
              network: "Besu",
            },
          },
        });
      } catch (swapError) {
        logger.error(
          "[DRESS_TOKEN/TRANSFER] Automatic DP swap failed:",
          swapError
        );

        // 전송은 성공했지만 스왑 실패
        return res.json({
          success: true,
          message:
            "Dress 토큰 전송은 성공했지만, 자동 DP 스왑이 실패했습니다. API #6(수동 스왑)을 이용해주세요.",
          data: {
            transfer: {
              txHash: polygonTxHash,
              from: storedWalletData.sid,
              to,
              amount,
              contractAddress: POLYGON_DRESS_TOKEN_ADDRESS,
              network: "polygon",
            },
            swapError: {
              message: swapError.message,
              suggestion: "API #6 (수동 스왑)을 사용하여 DP Token을 받으세요.",
            },
          },
        });
      }
    }

    // 일반 전송 (플랫폼 지갑이 아닌 경우)
    return res.json({
      success: true,
      message: "Dress 토큰이 성공적으로 전송되었습니다.",
      data: {
        txHash: receipt.transactionHash,
        from: storedWalletData.sid,
        to,
        amount,
        contractAddress: POLYGON_DRESS_TOKEN_ADDRESS,
        network: "polygon",
      },
    });
  } catch (error) {
    logger.error("[DRESS_TOKEN/TRANSFER] Error:", error);

    // 1. 장치 비밀번호 검증 실패
    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    // 2. 가스비(MATIC) 부족
    if (
      error.message.includes("insufficient funds") ||
      error.message.includes("gas required exceeds allowance") ||
      error.message.includes("out of gas")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "가스비(MATIC)가 부족합니다. Polygon 네트워크에서 트랜잭션을 전송하려면 MATIC이 필요합니다.",
        error: "INSUFFICIENT_GAS",
        details: {
          network: "Polygon",
          requiredToken: "MATIC",
          fromAddress: storedWalletData.sid,
          suggestion: "지갑에 최소 0.1 MATIC을 추가해주세요.",
        },
      });
    }

    // 3. 토큰 잔액 부족
    if (
      error.message.includes("transfer amount exceeds balance") ||
      error.message.includes("ERC20: transfer amount exceeds balance") ||
      error.message.includes("insufficient balance")
    ) {
      return res.status(400).json({
        success: false,
        message: "Dress 토큰 잔액이 부족합니다.",
        error: "INSUFFICIENT_TOKEN_BALANCE",
        details: {
          token: "DRESS",
          network: "Polygon",
          fromAddress: storedWalletData.sid,
          requestedAmount: amount,
        },
      });
    }

    // 4. EVM Revert (일반적인 스마트 컨트랙트 실행 실패)
    if (
      error.message.includes("reverted by the EVM") ||
      error.message.includes("execution reverted")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "트랜잭션이 실패했습니다. 가스비(MATIC) 또는 토큰 잔액을 확인해주세요.",
        error: "TRANSACTION_REVERTED",
        details: {
          possibleReasons: [
            "MATIC 잔액 부족 (가스비)",
            "DRESS 토큰 잔액 부족",
            "컨트랙트 일시 중지 상태",
          ],
          fromAddress: storedWalletData.sid,
          network: "Polygon",
        },
      });
    }

    // 5. RPC 연결 실패
    if (
      error.message.includes("Invalid response") ||
      error.message.includes("connection") ||
      error.message.includes("timeout") ||
      error.message.includes("network")
    ) {
      return res.status(503).json({
        success: false,
        message:
          "Polygon 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        error: "NETWORK_ERROR",
        details: {
          network: "Polygon",
          rpcUrl: process.env.POLYGON_RPC_URL,
        },
      });
    }

    // 6. Nonce 에러
    if (
      error.message.includes("nonce") ||
      error.message.includes("replacement transaction underpriced")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "트랜잭션 순서 오류입니다. 이전 트랜잭션이 완료될 때까지 기다려주세요.",
        error: "NONCE_ERROR",
      });
    }

    // 7. 서명 실패
    if (error.message.includes("signing") || error.message.includes("sign")) {
      return res.status(500).json({
        success: false,
        message: "트랜잭션 서명에 실패했습니다.",
        error: "SIGNING_FAILED",
        details: error.message,
      });
    }

    // 8. 기타 에러
    return res.status(500).json({
      success: false,
      message: "Dress 토큰 전송 중 오류가 발생했습니다.",
      error: error.message,
      details: {
        fromAddress: storedWalletData.sid,
        toAddress: to,
        amount: amount,
        network: "Polygon",
      },
    });
  }
};

/**
 * Dress 토큰 전송 + DP 토큰 자동 스왑 통합 API (플랫폼 전용)
 * POST /api/utils/dress-token/transfer-and-swap
 *
 * 프로세스:
 * 1. Dress Token을 플랫폼 어드민 지갑으로 전송 (Polygon)
 * 2. 전송 완료 후 자동으로 Swap API 호출
 * 3. DRESS × 5배의 DP Token을 사용자에게 지급 (Besu)
 */
exports.transferDressTokenAndSwap = async (req, res) => {
  const { amount, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  if (!amount || !devicePassword || !storedWalletData) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
    });
  }

  try {
    const fromAddress = storedWalletData.sid;

    logger.info(
      "[DRESS_SWAP_INTEGRATED] Starting integrated transfer and swap:",
      {
        from: fromAddress,
        to: PLATFORM_ADMIN_WALLET,
        amount,
      }
    );

    // === 1단계: Dress Token 전송 (Polygon) ===
    logger.info(
      "[DRESS_SWAP_INTEGRATED] Step 1: Transferring Dress Token to platform..."
    );

    // 전송 금액을 Wei로 변환
    const amountInWei = web3.utils.toWei(amount.toString(), "ether");

    // 사전 검증: MATIC 잔액 확인
    try {
      const { Web3 } = require("web3");
      const polygonWeb3 = new Web3(POLYGON_RPC_URL);
      const maticBalance = await polygonWeb3.eth.getBalance(fromAddress);
      const maticBalanceInEther = polygonWeb3.utils.fromWei(
        maticBalance,
        "ether"
      );

      if (parseFloat(maticBalanceInEther) < 0.001) {
        return res.status(400).json({
          success: false,
          message: "가스비(MATIC)가 부족합니다. 최소 0.1 MATIC이 필요합니다.",
          error: "INSUFFICIENT_GAS",
          details: {
            maticBalance: maticBalanceInEther,
            required: "0.1",
          },
        });
      }
    } catch (balanceCheckError) {
      logger.warn(
        "[DRESS_SWAP_INTEGRATED] Balance check failed:",
        balanceCheckError.message
      );
    }

    // ERC20 transfer 트랜잭션 데이터 생성
    const transferData = web3.eth.abi.encodeFunctionCall(
      {
        name: "transfer",
        type: "function",
        inputs: [
          { type: "address", name: "to" },
          { type: "uint256", name: "amount" },
        ],
      },
      [PLATFORM_ADMIN_WALLET, amountInWei]
    );

    const txData = {
      to: POLYGON_DRESS_TOKEN_ADDRESS,
      data: transferData,
      value: "0",
    };

    // Polygon MPC 서비스로 트랜잭션 실행
    const transferReceipt =
      await mpcService.executeTransactionWithStoredDataForPolygon(
        storedWalletData,
        devicePassword,
        txData,
        accessToken
      );

    const polygonTxHash = transferReceipt.transactionHash;

    logger.info("[DRESS_SWAP_INTEGRATED] Step 1 completed:", {
      polygonTxHash,
      from: fromAddress,
      to: PLATFORM_ADMIN_WALLET,
      amount,
    });

    // === 2단계: 자동 Swap 실행 (Polygon → Besu) ===
    logger.info("[DRESS_SWAP_INTEGRATED] Step 2: Starting automatic swap...");

    // 2-1. Polygon 트랜잭션 검증
    const { Web3 } = require("web3");
    const polygonWeb3 = new Web3(POLYGON_RPC_URL);

    const tx = await polygonWeb3.eth.getTransaction(polygonTxHash);
    if (!tx) {
      throw new Error("Polygon transaction not found");
    }

    const receipt = await polygonWeb3.eth.getTransactionReceipt(polygonTxHash);
    if (!receipt || !receipt.status) {
      throw new Error("Polygon transaction failed or not confirmed");
    }

    // 2-2. Transfer 이벤트 파싱
    const transferEventSignature = polygonWeb3.utils.keccak256(
      "Transfer(address,address,uint256)"
    );

    const transferLog = receipt.logs.find(
      (log) =>
        log.topics[0] === transferEventSignature &&
        log.address.toLowerCase() === POLYGON_DRESS_TOKEN_ADDRESS.toLowerCase()
    );

    if (!transferLog) {
      throw new Error("Transfer event not found in transaction logs");
    }

    const toAddress = "0x" + transferLog.topics[2].slice(26);
    const dressAmount = BigInt(transferLog.data);

    logger.info("[DRESS_SWAP_INTEGRATED] Transfer event decoded:", {
      from: fromAddress,
      to: toAddress,
      amount: dressAmount.toString(),
    });

    // 2-3. 받는 주소가 플랫폼 어드민 지갑인지 확인
    if (toAddress.toLowerCase() !== PLATFORM_ADMIN_WALLET.toLowerCase()) {
      throw new Error("Transfer recipient is not platform admin wallet");
    }

    // 2-4. DP Token 수량 계산 (DRESS × 5)
    const dressAmountInEther = polygonWeb3.utils.fromWei(
      dressAmount.toString(),
      "ether"
    );
    const dpAmount = parseFloat(dressAmountInEther) * SWAP_RATE;

    logger.info("[DRESS_SWAP_INTEGRATED] Calculated DP amount:", {
      dressAmount: dressAmountInEther,
      swapRate: SWAP_RATE,
      dpAmount,
    });

    // 2-5. DP Token 전송 (Faucet 패턴)
    logger.info("[DRESS_SWAP_INTEGRATED] Sending DP tokens to user...");
    const dpAmountInWei = web3.utils.toWei(dpAmount.toString(), "ether");

    const dpReceipt = await blockchainService.transferDP(
      fromAddress,
      dpAmountInWei
    );

    logger.info("[DRESS_SWAP_INTEGRATED] Swap completed successfully:", {
      dressTxHash: polygonTxHash,
      dpTxHash: dpReceipt.transactionHash,
      dressAmount: dressAmountInEther,
      dpAmount,
    });

    // === 최종 응답 ===
    return res.json({
      success: true,
      message: `✅ 완료! ${dressAmountInEther} DRESS → ${dpAmount} DP 스왑이 완료되었습니다.`,
      data: {
        summary: {
          dressAmount: dressAmountInEther,
          dpAmount: dpAmount.toString(),
          swapRate: SWAP_RATE,
          message: `${dressAmountInEther} DRESS를 플랫폼으로 전송하고 ${dpAmount} DP를 받았습니다.`,
        },
        polygon: {
          txHash: polygonTxHash,
          from: fromAddress,
          to: PLATFORM_ADMIN_WALLET,
          blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
          network: "Polygon",
        },
        besu: {
          txHash: dpReceipt.transactionHash,
          from: FAUCET_ADMIN_ADDRESS,
          to: fromAddress,
          blockNumber: dpReceipt.blockNumber
            ? Number(dpReceipt.blockNumber)
            : null,
          network: "Besu",
        },
      },
    });
  } catch (error) {
    logger.error("[DRESS_SWAP_INTEGRATED] Error:", error);

    // 에러 타입별 처리
    if (error.message.includes("INVALID_DEVICE_PASSWORD")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    if (error.message.includes("INSUFFICIENT_GAS")) {
      return res.status(400).json({
        success: false,
        message: "가스비(MATIC)가 부족합니다.",
        error: "INSUFFICIENT_GAS",
      });
    }

    if (
      error.message.includes("Transaction has been reverted") ||
      error.message.includes("TRANSACTION_REVERTED")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "트랜잭션이 실패했습니다. 가스비(MATIC) 또는 토큰 잔액을 확인해주세요.",
        error: "TRANSACTION_REVERTED",
        details: {
          possibleReasons: [
            "MATIC 잔액 부족 (가스비)",
            "DRESS 토큰 잔액 부족",
            "컨트랙트 일시 중지 상태",
          ],
        },
      });
    }

    if (
      error.message.includes("Invalid response") ||
      error.message.includes("connection") ||
      error.message.includes("timeout")
    ) {
      return res.status(503).json({
        success: false,
        message: "네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        error: "NETWORK_ERROR",
      });
    }

    return res.status(500).json({
      success: false,
      message: "통합 스왑 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

module.exports = {
  faucet: exports.faucet,
  swapDressToDp: exports.swapDressToDp,
  getDressTokenBalance: exports.getDressTokenBalance,
  transferDPToken: exports.transferDPToken,
  transferDressToken: exports.transferDressToken,
  transferDressTokenAndSwap: exports.transferDressTokenAndSwap,
  uploadFileToIPFS: exports.uploadFileToIPFS,
  uploadJSONToIPFS: exports.uploadJSONToIPFS,
  debugIpNftState,
};
