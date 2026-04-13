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

/**
 * 단일 RPC Promise에 상한 시간을 둔다. 타임아웃 없이 hang 하면 Promise.all이 끝나지 않아 응답이 오지 않음.
 */
function promiseWithTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(timeoutMessage || `RPC timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(to);
        resolve(v);
      },
      (e) => {
        clearTimeout(to);
        reject(e);
      }
    );
  });
}

/**
 * TPS 전용: 스킴 없는 호스트(:포트)는 http로 간주 (다른 API에 영향 없음)
 */
function normalizeTpsRpcBaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) throw new Error("RPC URL이 비어 있습니다.");
  const withScheme = /^https?:\/\//i.test(s) ? s : `http://${s}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * TPS 전용 JSON-RPC(eth_blockNumber). Web3 대비 직렬화·프로바이더 오버헤드 감소 + keep-alive 재사용.
 */
async function tpsEthBlockNumber(axiosInstance, rpcTimeoutMs, jsonRpcId) {
  const body = { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: jsonRpcId };
  const res = await axiosInstance.post("/", body, {
    timeout: rpcTimeoutMs,
    headers: { "Content-Type": "application/json" },
  });
  const data = res.data;
  if (data && data.error) {
    const e = data.error;
    throw new Error(typeof e.message === "string" ? e.message : JSON.stringify(e));
  }
  const hex = data && data.result;
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid eth_blockNumber result");
  }
  return BigInt(hex).toString();
}

function tpsFormatAxiosError(err) {
  if (err && err.code === "ECONNABORTED") return err.message || "request timeout";
  if (err && err.response && err.response.data !== undefined) {
    const d = err.response.data;
    const s = typeof d === "string" ? d : JSON.stringify(d);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  }
  if (err && typeof err.message === "string") return err.message;
  return String(err);
}

/**
 * 블록체인 조회 TPS 성능 테스트
 * eth_blockNumber를 호출한다. 매 초 경계마다 targetTps개를 추가로 발사(이전 요청 완료를 기다리지 않음).
 * 달성 TPS = 성공 건수 ÷ duration(초). 일부 노드는 eth_getBalance가 result:null을 반환해 사용하지 않음.
 *
 * 구현: 이 핸들러 안에서만 axios + http(s).Agent(keep-alive)로 JSON-RPC — 타 API·전역 에이전트와 분리.
 */
const runTpsTest = async (req, res) => {
  const { targetTps, durationSeconds, rpcUrls, rpcWeights } = req.body;

  const http = require("http");
  const https = require("https");
  const axios = require("axios");

  /** TPS 테스트 RPC 호스트당 동시 소켓 상한 (기본 1024). 다른 라우트에는 미사용. */
  const rawSockets = parseInt(process.env.TPS_HTTP_MAX_SOCKETS, 10);
  const maxSockets =
    Number.isFinite(rawSockets) && rawSockets >= 64 && rawSockets <= 4096 ? rawSockets : 1024;

  /**
   * 매 초마다 targetTps개를 한 틱에 몰아넣으면 노드/LB 순간 동시 연결 피크로 socket hang up이 반복될 수 있음.
   * 기본 true: 같은 초 안에서 (i/targetTps)*1000 ms 만큼 지연을 나눠 발사(초당 합계는 동일).
   * 버스트 한계만 재현하려면 TPS_STAGGER_WITHIN_SECOND=0
   */
  const staggerRaw = process.env.TPS_STAGGER_WITHIN_SECOND;
  const staggerWithinSecond =
    staggerRaw === undefined || staggerRaw === null || String(staggerRaw).trim() === ""
      ? true
      : !/^(0|false|no|off)$/i.test(String(staggerRaw).trim());

  let rpcClients = null;

  try {

    const rawTimeout = parseInt(process.env.TPS_RPC_TIMEOUT_MS, 10);
    const rpcTimeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout >= 3000 && rawTimeout <= 600000
        ? rawTimeout
        : 120000;

    /**
     * 각 RPC는 TPS_RPC_TIMEOUT_MS(기본 120s)만 적용. (과거 전역 마감으로 per-RPC 시간을 깎으면
     * 고부하 시 remaining이 줄어 전 요청이 ~50ms만 시도되어 성공 0·0TPS가 발생했음.)
     */
    const tps = Math.min(parseInt(targetTps) || 1100, 5000);
    const duration = Math.min(parseInt(durationSeconds) || 5, 30);

    /**
     * 배포 서버 전용(실서비스 로직과 무관): TPS 테스트만 VPC 내부 RPC(프라이빗 IP:8545)로 보내려면
     * TPS_TEST_RPC_ENDPOINTS="http://172.31.a.b:8545,..." 를 설정하면 요청 body의 rpcUrls보다 우선한다.
     * 로컬/미설정 시 기존과 동일(body 또는 기본 RPC_URL).
     */
    const envTpsRpc = process.env.TPS_TEST_RPC_ENDPOINTS;
    let rpcEndpointSource = "request";
    let endpoints;
    if (envTpsRpc != null && String(envTpsRpc).trim() !== "") {
      const parsed = String(envTpsRpc)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length > 0) {
        endpoints = parsed;
        rpcEndpointSource = "env:TPS_TEST_RPC_ENDPOINTS";
      } else {
        endpoints =
          rpcUrls && rpcUrls.length > 0
            ? rpcUrls
            : [process.env.RPC_URL || "https://besu.dressdio.me"];
      }
    } else {
      endpoints =
        rpcUrls && rpcUrls.length > 0
          ? rpcUrls
          : [process.env.RPC_URL || "https://besu.dressdio.me"];
    }

    const weightsRaw =
      rpcEndpointSource === "env:TPS_TEST_RPC_ENDPOINTS"
        ? null
        : Array.isArray(rpcWeights)
          ? rpcWeights
          : null;
    const weights = endpoints.map((_, i) => {
      const w = weightsRaw && weightsRaw[i] !== undefined && weightsRaw[i] !== null
        ? parseFloat(weightsRaw[i])
        : 1;
      return Number.isFinite(w) && w > 0 ? w : 1;
    });
    const weightSum = weights.reduce((a, b) => a + b, 0);

    /** 가중치 비율로 엔드포인트 선택 (전역 순번 기준, 매 초마다 비율 유지) */
    const pickEndpoint = (globalIdx) => {
      let r = globalIdx % weightSum;
      for (let e = 0; e < weights.length; e++) {
        r -= weights[e];
        if (r < 0) return e;
      }
      return weights.length - 1;
    };

    const baseUrls = endpoints.map((u) => normalizeTpsRpcBaseUrl(u));
    rpcClients = baseUrls.map((baseURL) => {
      const httpAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets,
        maxFreeSockets: Math.min(512, maxSockets),
      });
      const httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets,
        maxFreeSockets: Math.min(512, maxSockets),
      });
      const instance = axios.create({
        baseURL,
        timeout: rpcTimeoutMs,
        httpAgent,
        httpsAgent,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return { instance, httpAgent, httpsAgent, baseURL };
    });

    const totalRequests = tps * duration;
    const requestLogs = [];

    const testStartTime = Date.now();

    logger.info(
      `[TPS Test] 시작: ${tps}/s × ${duration}s = ${totalRequests}건, transport=json-rpc+axios+keep-alive, maxSockets/host=${maxSockets}, staggerWithinSec=${staggerWithinSecond}, RPC 건당 타임아웃 ${rpcTimeoutMs}ms, 노드 ${endpoints.length}개, rpc출처=${rpcEndpointSource}`
    );

    const allPromises = [];

    for (let sec = 0; sec < duration; sec++) {
      const boundary = testStartTime + sec * 1000;
      let waitMs = boundary - Date.now();
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }

      for (let i = 0; i < tps; i++) {
        const idx = sec * tps + i;
        const endpointIdx = pickEndpoint(idx);
        const client = rpcClients[endpointIdx].instance;
        allPromises.push(
          (async () => {
            if (staggerWithinSecond && tps > 1) {
              const staggerMs = (i * 1000) / tps;
              if (staggerMs > 0) {
                await new Promise((r) => setTimeout(r, staggerMs));
              }
            }
            const reqStart = Date.now();
            try {
              const blockNo = await promiseWithTimeout(
                tpsEthBlockNumber(client, rpcTimeoutMs, idx + 1),
                rpcTimeoutMs,
                `eth_blockNumber timeout ${rpcTimeoutMs}ms`
              );
              const reqEnd = Date.now();
              const latency = reqEnd - reqStart;
              requestLogs.push({
                seq: idx + 1,
                second: sec + 1,
                timestamp: new Date(reqStart).toISOString(),
                rpcEndpoint: endpoints[endpointIdx],
                method: "eth_blockNumber",
                params: [],
                success: true,
                latencyMs: latency,
                responseBlockNumber: String(blockNo),
                error: null,
              });
            } catch (err) {
              const reqEnd = Date.now();
              const latency = reqEnd - reqStart;
              const errMsg = tpsFormatAxiosError(err);
              requestLogs.push({
                seq: idx + 1,
                second: sec + 1,
                timestamp: new Date(reqStart).toISOString(),
                rpcEndpoint: endpoints[endpointIdx],
                method: "eth_blockNumber",
                params: [],
                success: false,
                latencyMs: latency,
                responseBlockNumber: null,
                error: errMsg,
              });
            }
          })()
        );
      }
    }

    await Promise.all(allPromises);

    const testEndTime = Date.now();
    const totalElapsedMs = testEndTime - testStartTime;

    requestLogs.sort((a, b) => a.seq - b.seq);

    const perSecondStats = [];
    for (let s = 1; s <= duration; s++) {
      const logsSec = requestLogs.filter((r) => r.second === s);
      const starts = logsSec.map((r) => new Date(r.timestamp).getTime());
      const ends = logsSec.map((r) => new Date(r.timestamp).getTime() + r.latencyMs);
      const batchStart = starts.length ? Math.min(...starts) : 0;
      const batchEnd = ends.length ? Math.max(...ends) : 0;
      const sortedLat = logsSec.map((r) => r.latencyMs).sort((a, b) => a - b);
      const secSuccess = logsSec.filter((r) => r.success).length;
      const secFail = logsSec.filter((r) => !r.success).length;
      perSecondStats.push({
        second: s,
        requests: tps,
        success: secSuccess,
        fail: secFail,
        elapsedMs: batchEnd - batchStart,
        avgLatencyMs: sortedLat.length > 0 ? parseFloat((sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length).toFixed(2)) : 0,
        minLatencyMs: sortedLat.length > 0 ? sortedLat[0] : 0,
        maxLatencyMs: sortedLat.length > 0 ? sortedLat[sortedLat.length - 1] : 0,
        p95LatencyMs: sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.95)] : 0,
      });
    }

    const successCount = requestLogs.filter((r) => r.success).length;
    const failCount = requestLogs.filter((r) => !r.success).length;
    const successRate = ((successCount / totalRequests) * 100).toFixed(2);
    /** 달성 TPS: 설정한 테스트 구간(초)당 성공 건수 — 전 구간 성공 시 targetTps와 일치 */
    const actualRps = (duration > 0 ? successCount / duration : 0).toFixed(2);

    const latencies = requestLogs.filter((r) => r.success).map((r) => r.latencyMs).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0
      ? (latencies.reduce((s, v) => s + v, 0) / latencies.length).toFixed(2)
      : 0;
    const minLatency = latencies.length > 0 ? latencies[0] : 0;
    const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

    const sampleBlockNumber = requestLogs.find((r) => r.success)?.responseBlockNumber || "N/A";
    const firstFailureLog = requestLogs.find((r) => !r.success);
    const firstFailureMessage = firstFailureLog
      ? String(firstFailureLog.error || "").slice(0, 300)
      : null;

    const throughputPass = parseFloat(actualRps) >= tps;

    /** TPS 완료 시점: 프로세스 메모리·엔드포인트별 실패 건수 — 부하 한계(백엔드 vs RPC) 추적용 */
    try {
      const mu = process.memoryUsage();
      const rssMb = (mu.rss / 1024 / 1024).toFixed(1);
      const heapMb = (mu.heapUsed / 1024 / 1024).toFixed(1);
      const failByEndpoint = {};
      for (let fi = 0; fi < requestLogs.length; fi++) {
        const row = requestLogs[fi];
        if (row && row.success === false && row.rpcEndpoint) {
          const key = String(row.rpcEndpoint).replace(/^https?:\/\//, "").slice(0, 56);
          failByEndpoint[key] = (failByEndpoint[key] || 0) + 1;
        }
      }
      logger.info(
        `[TPS Test] 완료: 성공 ${successCount}/${totalRequests} (${successRate}%), 실패 ${failCount}, wall ${totalElapsedMs}ms, ` +
          `Node RSS=${rssMb}MiB heapUsed=${heapMb}MiB, 실패분포=${JSON.stringify(failByEndpoint)}`
      );
    } catch (e) {
      logger.warn("[TPS Test] 완료 요약 로그 생략:", e && e.message);
    }

    const rpcRequestCounts = endpoints.map((ep) => ({
      endpoint: ep,
      count: requestLogs.filter((r) => r.rpcEndpoint === ep).length,
    }));
    const rpcExpectedPct = weights.map((w) => parseFloat(((w / weightSum) * 100).toFixed(2)));

    const report = {
      testInfo: {
        testDate: new Date(testStartTime).toISOString(),
        rpcMethod: "eth_blockNumber",
        /** TPS 전용: 전역 Web3 미사용, 엔드포인트별 keep-alive Agent + JSON-RPC */
        tpsTransport: {
          mode: "json-rpc+axios+keep-alive",
          maxSocketsPerHost: maxSockets,
          staggerWithinSecond: staggerWithinSecond,
        },
        rpcEndpoints: endpoints,
        /** request | env:TPS_TEST_RPC_ENDPOINTS — 배포에서 VPC 프라이빗 RPC만 쓸 때 구분 */
        rpcEndpointSource,
        rpcWeights: weights,
        rpcWeightSum: weightSum,
        rpcExpectedDistributionPct: rpcExpectedPct,
        rpcRequestCounts,
        nodeCount: endpoints.length,
        targetTps: tps,
        durationSeconds: duration,
        totalPlannedRequests: totalRequests,
      },
      results: {
        totalElapsedMs,
        totalElapsedSeconds: (totalElapsedMs / 1000).toFixed(2),
        successCount,
        failCount,
        successRate: `${successRate}%`,
        actualRps: parseFloat(actualRps),
        throughputPass,
        sampleBlockNumber,
        firstFailureMessage,
      },
      latency: {
        avgMs: parseFloat(avgLatency),
        minMs: minLatency,
        maxMs: maxLatency,
        p50Ms: p50,
        p95Ms: p95,
        p99Ms: p99,
      },
      perSecondStats,
      requestLogs,
      verdict: throughputPass
        ? `PASS (통과) — 달성 ${actualRps} TPS (초당 처리 건수), 목표 ${tps} TPS`
        : `달성 ${actualRps} TPS (건/초), 목표 ${tps} TPS`,
    };

    return res.json({ success: true, data: report });
  } catch (error) {
    logger.error("[TPS Test] 오류:", error);
    return res.status(500).json({ success: false, message: "TPS 테스트 중 오류가 발생했습니다.", error: error.message });
  } finally {
    if (rpcClients && Array.isArray(rpcClients)) {
      for (const c of rpcClients) {
        try {
          if (c.httpAgent && typeof c.httpAgent.destroy === "function") c.httpAgent.destroy();
          if (c.httpsAgent && typeof c.httpsAgent.destroy === "function") c.httpsAgent.destroy();
        } catch (_) {
          /* ignore */
        }
      }
    }
  }
};

/**
 * PDF 생성 전 본문 크기·메모리 완화 (실패 로그의 error 필드가 길면 JSON이 Nginx 한도 초과 → 413)
 */
function normalizeTpsReportForPdfInPlace(report) {
  const MAX_ERR_LEN = 120;
  const MAX_LOG_ROWS = 4000;
  const logs = report.requestLogs;
  if (!Array.isArray(logs) || logs.length === 0) return;
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log && log.error != null) {
      const s = String(log.error);
      log.error = s.length > MAX_ERR_LEN ? `${s.slice(0, MAX_ERR_LEN)}…` : s;
    }
  }
  if (logs.length > MAX_LOG_ROWS) {
    report.testInfo = report.testInfo || {};
    if (!report.testInfo.pdfLogsNote) {
      report.testInfo.pdfLogsNote = `요청 로그 ${logs.length.toLocaleString()}건 중 앞 ${MAX_LOG_ROWS.toLocaleString()}건만 표시`;
    }
    report.requestLogs = logs.slice(0, MAX_LOG_ROWS);
  }
}

/**
 * TPS 테스트 결과를 PDF로 다운로드 (초별 집계 + RPC 요청 로그 포함)
 */
const downloadTpsReport = async (req, res) => {
  const { report } = req.body;

  try {
    if (!report || !report.testInfo || !report.results || !report.latency) {
      return res.status(400).json({ success: false, message: "유효한 report 데이터가 필요합니다." });
    }

    normalizeTpsReportForPdfInPlace(report);

    const PDFDocument = require("pdfkit");
    const path = require("path");
    const fs = require("fs");
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });

    const fontPath = path.join(__dirname, "../../assets/fonts/AppleGothic.ttf");
    const bodyFont = fs.existsSync(fontPath) ? "KR" : "Helvetica";
    if (bodyFont === "KR") {
      doc.registerFont("KR", fontPath);
    } else {
      logger.warn("[TPS PDF] AppleGothic.ttf 없음 — Helvetica 사용 (한글 깨질 수 있음)");
    }

    res.setHeader("Content-Type", "application/pdf");
    const fileName = `TPS_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    doc.pipe(res);

    const ti = report.testInfo;
    const rs = report.results;
    const lt = report.latency;
    const L = 40;
    const R = 555;
    const TW = R - L;
    const passed =
      rs.throughputPass !== undefined ? rs.throughputPass : rs.actualRps >= ti.targetTps;

    const checkPage = (h) => { if (doc.y + h > 780) doc.addPage(); };

    // ── helpers ──

    const sectionTitle = (title) => {
      checkPage(30);
      doc.moveDown(0.6);
      doc.fontSize(12).font(bodyFont).fillColor("#1a237e").text(title, L);
      const ly = doc.y + 1;
      doc.moveTo(L, ly).lineTo(R, ly).strokeColor("#ccc").lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fillColor("#000");
    };

    const kvRow = (label, value, opts = {}) => {
      checkPage(16);
      const y = doc.y;
      const labelW = 170;
      if (opts.bg) { doc.rect(L, y - 1, TW, 14).fill(opts.bg); doc.fillColor("#000"); }
      doc.fontSize(9).font(bodyFont).fillColor("#333").text(label, L + 8, y, { width: labelW });
      doc.fontSize(9).font(bodyFont).fillColor(opts.color || "#000").text(String(value), L + labelW + 8, y, { width: TW - labelW - 16 });
      doc.y = y + 14;
    };

    const drawGrid = (cols, rows, startY, rowH, headerH, fontSize) => {
      const hdrColor = "#37474f";
      const startX = L;

      const drawHdr = () => {
        checkPage(headerH + 4);
        const y = doc.y;
        doc.rect(startX, y, TW, headerH).fill(hdrColor);
        let x = startX;
        cols.forEach((c) => {
          doc.fontSize(fontSize).font(bodyFont).fillColor("#fff")
            .text(c.label, x, y + (headerH - fontSize) / 2, { width: c.width, align: "center" });
          x += c.width;
        });
        // vertical lines
        x = startX;
        cols.forEach((c) => {
          doc.moveTo(x, y).lineTo(x, y + headerH).strokeColor("#546e7a").lineWidth(0.3).stroke();
          x += c.width;
        });
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
        doc.fillColor("#000");
        doc.y = y + headerH;
      };

      drawHdr();

      rows.forEach((vals, ri) => {
        if (doc.y + rowH > 780) { doc.addPage(); drawHdr(); }
        const y = doc.y;
        const bg = vals._bg || (ri % 2 === 0 ? "#f8f9fa" : "#fff");
        doc.rect(startX, y, TW, rowH).fill(bg);

        // outer border
        doc.rect(startX, y, TW, rowH).strokeColor("#ddd").lineWidth(0.3).stroke();
        // vertical lines
        let x = startX;
        cols.forEach((c) => {
          doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor("#ddd").lineWidth(0.3).stroke();
          x += c.width;
        });
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();

        // cell text
        x = startX;
        vals.forEach((val, ci) => {
          const align = cols[ci].align || "center";
          doc.fontSize(fontSize).font(bodyFont).fillColor(vals._color || "#000")
            .text(String(val), x + 2, y + (rowH - fontSize) / 2, { width: cols[ci].width - 4, align });
          x += cols[ci].width;
        });

        doc.y = y + rowH;
      });
    };

    // ═══════ Page 1: Summary ═══════

    doc.fontSize(18).font(bodyFont).fillColor("#000")
      .text("Blockchain Query TPS Performance Report", { align: "center" });
    doc.moveDown(0.15);
    doc.fontSize(9).font(bodyFont).fillColor("#777")
      .text("Private Blockchain  |  Hyperledger Besu (Clique)  |  Read-Only Performance Test", { align: "center" });
    doc.fillColor("#000").moveDown(0.8);

    // 1. Test Environment
    sectionTitle("1. Test Environment");
    kvRow("Test Date", ti.testDate);
    kvRow("RPC Method", ti.rpcMethod, { bg: "#f8f9fa" });
    kvRow("RPC Endpoints", `${ti.nodeCount} node(s)`, { bg: "#f8f9fa" });
    (ti.rpcEndpoints || []).forEach((ep, i) => {
      const act = ti.rpcRequestCounts && ti.rpcRequestCounts[i]
        ? `${ti.rpcRequestCounts[i].count} req`
        : "—";
      kvRow(`    #${i + 1}`, `${ep}  |  ${act}`);
    });
    kvRow("Target TPS", `${ti.targetTps.toLocaleString()} req/sec`, { bg: "#f8f9fa" });
    kvRow("Duration", `${ti.durationSeconds} sec`);
    kvRow("Total Requests", `${ti.totalPlannedRequests.toLocaleString()}  (${ti.targetTps.toLocaleString()} x ${ti.durationSeconds}s)`, { bg: "#f8f9fa" });

    // 2. Results
    sectionTitle("2. Results");
    kvRow("Elapsed Time", `${rs.totalElapsedSeconds} sec  (${rs.totalElapsedMs} ms)`);
    kvRow("Success", `${rs.successCount.toLocaleString()}  (${rs.successRate})`, { bg: "#e8f5e9", color: "#2e7d32" });
    kvRow("Fail", `${rs.failCount.toLocaleString()}`, { bg: rs.failCount > 0 ? "#ffebee" : "#f8f9fa", color: rs.failCount > 0 ? "#c62828" : "#000" });
    kvRow("Sample block #", rs.sampleBlockNumber);
    doc.moveDown(0.4);
    checkPage(30);
    doc.rect(L, doc.y, TW, 26).fill(passed ? "#e8f5e9" : "#fff3e0").strokeColor(passed ? "#66bb6a" : "#ff9800").lineWidth(1).stroke();
    doc.fontSize(14).font(bodyFont).fillColor(passed ? "#2e7d32" : "#e65100")
      .text(`Achieved:  ${rs.actualRps}  TPS  (req/sec, read-only)`, L, doc.y + 6, { width: TW, align: "center" });
    doc.fillColor("#000");
    doc.y += 30;

    // 3. Latency
    sectionTitle("3. Latency");
    const latCols = [
      { label: "Avg", width: TW / 6 },
      { label: "Min", width: TW / 6 },
      { label: "Max", width: TW / 6 },
      { label: "P50", width: TW / 6 },
      { label: "P95", width: TW / 6 },
      { label: "P99", width: TW / 6 },
    ];
    const latVals = [`${lt.avgMs}`, `${lt.minMs}`, `${lt.maxMs}`, `${lt.p50Ms}`, `${lt.p95Ms}`, `${lt.p99Ms}`];
    latVals._bg = "#f8f9fa";
    drawGrid(latCols, [latVals], doc.y, 16, 16, 8);
    doc.moveDown(0.1);
    doc.fontSize(7).fillColor("#999").text("(unit: ms)", { align: "right" });
    doc.fillColor("#000");

    // 4. Verdict
    sectionTitle("4. Verdict");
    checkPage(20);
    doc.fontSize(12).font(bodyFont).fillColor(passed ? "#2e7d32" : "#e65100")
      .text(report.verdict, { align: "center" });
    doc.fillColor("#000");

    // ═══════ 5. Per-Second TPS Chart ═══════
    if (report.perSecondStats && report.perSecondStats.length > 0) {
      doc.addPage();
      const stats = report.perSecondStats;

      sectionTitle("5. Per-Second Throughput");
      const cL = L + 30, cW = TW - 40, cH = 160;
      const cTop = doc.y + 5, cBot = cTop + cH;
      const mx = Math.max(ti.targetTps, ...stats.map((s) => s.success)) * 1.15;
      const bW = Math.min(36, (cW - 8) / stats.length - 4);
      const bG = (cW - bW * stats.length) / (stats.length + 1);

      doc.moveTo(cL, cTop).lineTo(cL, cBot).strokeColor("#333").lineWidth(0.7).stroke();
      doc.moveTo(cL, cBot).lineTo(cL + cW, cBot).strokeColor("#333").lineWidth(0.7).stroke();
      for (let g = 0; g <= 4; g++) {
        const v = Math.round((mx / 4) * g);
        const gy = cBot - (cH * g) / 4;
        doc.moveTo(cL, gy).lineTo(cL + cW, gy).strokeColor("#eee").lineWidth(0.3).stroke();
        doc.fontSize(6).font(bodyFont).fillColor("#999")
          .text(v.toLocaleString(), L, gy - 3, { width: 28, align: "right", lineBreak: false });
      }
      const tgY = cBot - (cH * ti.targetTps) / mx;
      for (let dx = 0; dx < cW; dx += 6) {
        doc.moveTo(cL + dx, tgY).lineTo(cL + Math.min(dx + 3, cW), tgY).strokeColor("#f44336").lineWidth(0.7).stroke();
      }
      doc.fontSize(6).font(bodyFont).fillColor("#f44336")
        .text(`Target ${ti.targetTps.toLocaleString()}`, cL + cW - 65, tgY - 8, { width: 65, align: "right", lineBreak: false });
      stats.forEach((s, i) => {
        const bx = cL + bG + i * (bW + bG);
        const bh = (cH * s.success) / mx;
        const bTop = cBot - bh;
        doc.rect(bx, bTop, bW, bh).fill(s.success >= ti.targetTps ? "#66bb6a" : "#42a5f5");
        doc.fontSize(5.5).font(bodyFont).fillColor("#333")
          .text(s.success.toLocaleString(), bx - 3, bTop - 8, { width: bW + 6, align: "center", lineBreak: false });
        doc.fontSize(5.5).font(bodyFont).fillColor("#555")
          .text(`${s.second}s`, bx - 2, cBot + 2, { width: bW + 4, align: "center", lineBreak: false });
      });
      doc.fillColor("#000");
      doc.y = cBot + 16;
      doc.fontSize(6).font(bodyFont).fillColor("#aaa")
        .text("Green = Target reached  |  Blue = Below target  |  Red dashed = Target TPS", { align: "center", lineBreak: false });
      doc.moveDown(1);

      // ═══════ 6. Per-Second Stats Table ═══════
      sectionTitle("6. Per-Second Statistics");

      const secCols = [
        { label: "Sec",  width: 40 },
        { label: "Req",  width: 55 },
        { label: "OK",   width: 50 },
        { label: "Fail", width: 45 },
        { label: "Elapsed", width: 60 },
        { label: "Avg",  width: 55 },
        { label: "Min",  width: 50 },
        { label: "Max",  width: 55 },
        { label: "P95",  width: 55 },
      ];
      // adjust last col to fill remaining
      const used = secCols.reduce((s, c) => s + c.width, 0);
      secCols[secCols.length - 1].width += TW - used;

      const secRows = report.perSecondStats.map((s) => {
        const v = [s.second, s.requests, s.success, s.fail, s.elapsedMs, s.avgLatencyMs, s.minLatencyMs, s.maxLatencyMs, s.p95LatencyMs];
        return v;
      });

      drawGrid(secCols, secRows, doc.y, 14, 16, 7.5);
      doc.moveDown(0.1);
      doc.fontSize(7).fillColor("#999").text("Elapsed / Avg / Min / Max / P95 unit: ms", { align: "right" });
      doc.fillColor("#000");
    }

    // ═══════ 7. Full RPC Request Logs ═══════
    if (report.requestLogs && report.requestLogs.length > 0) {
      doc.addPage();
      const logTitle = `7. RPC Request Logs  (${report.requestLogs.length.toLocaleString()} rows)`;
      sectionTitle(logTitle);
      if (ti.pdfLogsNote) {
        doc.fontSize(8).font(bodyFont).fillColor("#e65100").text(ti.pdfLogsNote, L, doc.y, { width: TW });
        doc.fillColor("#000").moveDown(0.5);
      }

      const logCols = [
        { label: "#",        width: 38 },
        { label: "Sec",      width: 30 },
        { label: "Timestamp", width: 120 },
        { label: "OK",       width: 24 },
        { label: "ms",       width: 42 },
        { label: "Block #", width: 145 },
        { label: "Endpoint", width: TW - 38 - 30 - 120 - 24 - 42 - 145 },
      ];

      const logRows = report.requestLogs.map((log) => {
        const ep = (log.rpcEndpoint || "").replace(/^https?:\/\//, "").slice(0, 22);
        const bal = log.success ? (log.responseBlockNumber || "0") : (log.error ? log.error.slice(0, 24) : "ERR");
        const ts = (log.timestamp || "").replace("T", " ").slice(11, 23);
        const v = [log.seq, log.second, ts, log.success ? "Y" : "N", log.latencyMs, bal, ep];
        if (!log.success) { v._bg = "#ffebee"; v._color = "#c62828"; }
        return v;
      });

      drawGrid(logCols, logRows, doc.y, 10, 14, 6);
    }

    // ── Footer on all pages ──
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font(bodyFont).fillColor("#bbb")
        .text(
          `Generated: ${new Date().toISOString()}  |  Dressdio Blockchain Platform  |  Page ${i + 1} / ${pageCount}`,
          L, 810, { width: TW, align: "center" }
        );
    }

    doc.end();
  } catch (error) {
    logger.error("[TPS PDF] 오류:", error);
    return res.status(500).json({ success: false, message: "PDF 생성 중 오류가 발생했습니다.", error: error.message });
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
  runTpsTest,
  downloadTpsReport,
};
