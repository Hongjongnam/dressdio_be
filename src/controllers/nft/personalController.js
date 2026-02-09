const {
  web3,
  personalNFTContract,
  dpTokenContract,
} = require("../../config/web3");
const { uploadJSONToIPFS } = require("../../services/upload");
const walletService = require("../../services/wallet");
const logger = require("../../utils/logger");
const { stringifyBigInts } = require("../../utils/utils");
const mpcService = require("../../services/blockchainMPC");
const axios = require("axios");

// 여러 IPFS 게이트웨이 (폴백용)
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
];
const IPFS_GATEWAY = IPFS_GATEWAYS[0]; // 기본 게이트웨이

// Helper function to build full IPFS URL
const toIpfsUrl = (uri) => {
  if (!uri) {
    return uri;
  }

  // data URI (base64 등)는 그대로 반환
  if (uri.startsWith("data:")) {
    return uri;
  }

  // http/https는 그대로 반환
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }

  // ipfs:// 프로토콜만 변환
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", IPFS_GATEWAY);
  }

  return uri;
};

// Helper function to fetch metadata from tokenURI and extract image URL
const fetchMetadataImage = async (tokenURI) => {
  // tokenURI에서 IPFS CID 추출
  let ipfsCid = null;
  if (tokenURI.startsWith("ipfs://")) {
    ipfsCid = tokenURI.replace("ipfs://", "");
  } else if (tokenURI.includes("/ipfs/")) {
    ipfsCid = tokenURI.split("/ipfs/")[1];
  }

  if (!ipfsCid) {
    logger.warn(`[Personal NFT] Could not extract IPFS CID from: ${tokenURI}`);
    return null;
  }

  // 여러 게이트웨이를 순차적으로 시도
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    const gateway = IPFS_GATEWAYS[i];
    const ipfsUrl = `${gateway}${ipfsCid}`;

    try {
      logger.info(
        `[Personal NFT] Trying gateway ${i + 1}/${
          IPFS_GATEWAYS.length
        }: ${ipfsUrl}`
      );

      const response = await axios.get(ipfsUrl, {
        timeout: 8000, // 8초
        maxContentLength: 50 * 1024 * 1024, // 50MB까지 허용
      });

      logger.info(
        `[Personal NFT] ✅ Gateway ${i + 1} succeeded! Keys: ${Object.keys(
          response.data || {}
        ).join(", ")}`
      );

      if (response.data) {
        // image 필드 확인
        if (response.data.image) {
          const imageData = response.data.image;
          const imagePreview =
            imageData.length > 100
              ? `${imageData.substring(0, 100)}...`
              : imageData;
          logger.info(
            `[Personal NFT] Image found (length: ${imageData.length}): ${imagePreview}`
          );
          return toIpfsUrl(imageData);
        }

        // 다른 가능한 필드명 확인
        if (response.data.imageUrl) {
          const imageData = response.data.imageUrl;
          logger.info(
            `[Personal NFT] imageUrl found (length: ${imageData.length})`
          );
          return toIpfsUrl(imageData);
        }

        if (response.data.imageUri) {
          const imageData = response.data.imageUri;
          logger.info(
            `[Personal NFT] imageUri found (length: ${imageData.length})`
          );
          return toIpfsUrl(imageData);
        }

        logger.warn(
          `[Personal NFT] No image field found. Available fields: ${JSON.stringify(
            Object.keys(response.data)
          )}`
        );
      }

      return null;
    } catch (error) {
      logger.warn(
        `[Personal NFT] ❌ Gateway ${i + 1} failed (${gateway}): ${
          error.message
        } (${error.response?.status || "no response"})`
      );

      // 마지막 게이트웨이도 실패했으면 에러 로깅
      if (i === IPFS_GATEWAYS.length - 1) {
        logger.error(
          `[Personal NFT] All ${IPFS_GATEWAYS.length} gateways failed for: ${tokenURI}`
        );
      }
      // 다음 게이트웨이 시도
      continue;
    }
  }

  return null;
};

// ==========================================
// 1. 구매 플로우
// ==========================================

/**
 * @notice 구매 요청 (DP 토큰 에스크로)
 * @route POST /api/nft/personal/request-purchase
 */
const requestPurchase = async (req, res) => {
  const { brandTokenId, artistTokenIds, devicePassword, storedWalletData } =
    req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (
      !accessToken ||
      !devicePassword ||
      !storedWalletData ||
      brandTokenId === undefined ||
      !artistTokenIds ||
      !Array.isArray(artistTokenIds) ||
      artistTokenIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required. brandTokenId, artistTokenIds (array), devicePassword, storedWalletData",
      });
    }

    const userWalletAddress = storedWalletData.sid;

    // 2. 가격 계산
    const totalPrice = await personalNFTContract.methods
      .calculatePrice(brandTokenId, artistTokenIds)
      .call();

    logger.info(
      `[Personal NFT] Calculated price: ${web3.utils.fromWei(
        totalPrice,
        "ether"
      )} DP`
    );

    // 3. DP 잔액 확인
    const dpBalance = await dpTokenContract.methods
      .balanceOf(userWalletAddress)
      .call();

    if (BigInt(dpBalance) < BigInt(totalPrice)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient DP balance. Required: ${web3.utils.fromWei(
          totalPrice,
          "ether"
        )} DP`,
      });
    }

    // 4. DP 승인 (Approve)
    const approveTxData = {
      to: dpTokenContract.options.address,
      data: dpTokenContract.methods
        .approve(personalNFTContract.options.address, totalPrice)
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
      `[Personal NFT] DP approved. Tx Hash: ${approveReceipt.transactionHash}`
    );

    // 5. 구매 요청 (requestPurchase)
    const requestTxData = {
      to: personalNFTContract.options.address,
      data: personalNFTContract.methods
        .requestPurchase(brandTokenId, artistTokenIds)
        .encodeABI(),
      value: "0",
    };

    const requestReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      requestTxData,
      accessToken
    );

    // 6. requestId 파싱
    let requestId = null;
    try {
      const eventAbi = personalNFTContract.options.jsonInterface.find(
        (e) => e.name === "PurchaseRequested" && e.type === "event"
      );

      if (eventAbi) {
        const eventLog = requestReceipt.logs.find(
          (log) =>
            log.address.toLowerCase() ===
              personalNFTContract.options.address.toLowerCase() &&
            log.topics[0] === eventAbi.signature
        );

        if (eventLog) {
          const decodedLog = web3.eth.abi.decodeLog(
            eventAbi.inputs,
            eventLog.data,
            eventLog.topics.slice(1)
          );
          requestId = decodedLog.requestId.toString();
        }
      }
    } catch (err) {
      logger.error("[Personal NFT] requestId parsing failed:", err);
    }

    res.json({
      success: true,
      message: "Purchase request created successfully.",
      txHash: requestReceipt.transactionHash,
      requestId: requestId,
      totalPrice: web3.utils.fromWei(totalPrice, "ether"),
    });
  } catch (error) {
    logger.error("[Personal NFT] requestPurchase error:", error);

    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create purchase request.",
      error: error.message,
    });
  }
};

/**
 * @notice 구매 확정 (NFT 발행 + 수익 분배)
 * @route POST /api/nft/personal/confirm-purchase
 */
const confirmPurchase = async (req, res) => {
  const { requestId, imageUrl, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (
      !accessToken ||
      requestId === undefined ||
      !imageUrl ||
      !devicePassword ||
      !storedWalletData
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required. requestId, imageUrl, devicePassword, storedWalletData",
      });
    }

    const userWalletAddress = storedWalletData.sid;

    // 2. 구매 요청 정보 조회
    const purchaseRequest = await personalNFTContract.methods
      .getPurchaseRequest(requestId)
      .call();

    // 3. 메타데이터 생성
    const metadata = {
      name: `Personal NFT #${requestId}`,
      description: `Custom NFT combining Brand #${purchaseRequest.brandTokenId} and ${purchaseRequest.artistTokenIds.length} Artist(s)`,
      image: imageUrl, // 🎨 사용자가 입력한 이미지 URL
      attributes: [
        { trait_type: "Request ID", value: String(requestId) },
        {
          trait_type: "Brand Token ID",
          value: String(purchaseRequest.brandTokenId),
        },
        {
          trait_type: "Artist Count",
          value: String(purchaseRequest.artistTokenIds.length),
        },
        {
          trait_type: "Total Price",
          value: web3.utils.fromWei(purchaseRequest.totalAmount, "ether"),
        },
        { trait_type: "Created At", value: new Date().toISOString() },
      ],
    };

    // 4. 메타데이터를 IPFS에 업로드
    let tokenURI;
    try {
      tokenURI = await uploadJSONToIPFS(metadata);
    } catch (err) {
      logger.error("[Personal NFT] IPFS upload failed:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to upload NFT metadata to IPFS.",
      });
    }

    // 5. 구매 확정 트랜잭션
    const confirmTxData = {
      to: personalNFTContract.options.address,
      data: personalNFTContract.methods
        .confirmPurchase(requestId, tokenURI)
        .encodeABI(),
      value: "0",
    };

    const confirmReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      confirmTxData,
      accessToken
    );

    // 6. NFT tokenId 파싱
    let tokenId = null;
    try {
      const eventAbi = personalNFTContract.options.jsonInterface.find(
        (e) => e.name === "PurchaseConfirmed" && e.type === "event"
      );

      if (eventAbi) {
        const eventLog = confirmReceipt.logs.find(
          (log) =>
            log.address.toLowerCase() ===
              personalNFTContract.options.address.toLowerCase() &&
            log.topics[0] === eventAbi.signature
        );

        if (eventLog) {
          const decodedLog = web3.eth.abi.decodeLog(
            eventAbi.inputs,
            eventLog.data,
            eventLog.topics.slice(1)
          );
          tokenId = decodedLog.nftTokenId.toString();
        }
      }
    } catch (err) {
      logger.error("[Personal NFT] tokenId parsing failed:", err);
    }

    res.json({
      success: true,
      message: "Purchase confirmed. Personal NFT minted successfully.",
      txHash: confirmReceipt.transactionHash,
      tokenId: tokenId,
      tokenURI: toIpfsUrl(tokenURI),
    });
  } catch (error) {
    logger.error("[Personal NFT] confirmPurchase error:", error);

    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to confirm purchase.",
      error: error.message,
    });
  }
};

/**
 * @notice 구매 취소 (환불 - 플랫폼 수수료)
 * @route POST /api/nft/personal/cancel-purchase
 */
const cancelPurchase = async (req, res) => {
  const { requestId, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (
      !accessToken ||
      requestId === undefined ||
      !devicePassword ||
      !storedWalletData
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required. requestId, devicePassword, storedWalletData",
      });
    }

    // 2. 구매 취소 트랜잭션
    const cancelTxData = {
      to: personalNFTContract.options.address,
      data: personalNFTContract.methods.cancelPurchase(requestId).encodeABI(),
      value: "0",
    };

    const cancelReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      cancelTxData,
      accessToken
    );

    res.json({
      success: true,
      message: "Purchase cancelled successfully.",
      txHash: cancelReceipt.transactionHash,
    });
  } catch (error) {
    logger.error("[Personal NFT] cancelPurchase error:", error);

    if (error.message.includes("Invalid device password")) {
      return res.status(401).json({
        success: false,
        message: "장치 비밀번호가 올바르지 않습니다.",
        error: "INVALID_DEVICE_PASSWORD",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to cancel purchase.",
      error: error.message,
    });
  }
};

// ==========================================
// 2. 조회 API
// ==========================================

/**
 * @notice 내 구매 요청 목록 조회
 * @route GET /api/nft/personal/my-requests
 */
const getMyPurchaseRequests = async (req, res) => {
  const accessToken = req.token;

  try {
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Access token is required.",
      });
    }

    const walletInfo = await walletService.getWallet(accessToken);
    const userWalletAddress = walletInfo.address;

    // 사용자별 구매 요청 ID 목록 조회
    const requestIds = await personalNFTContract.methods
      .getUserRequests(userWalletAddress)
      .call();

    // 각 요청 정보 조회
    const requestPromises = requestIds.map((requestId) =>
      personalNFTContract.methods
        .getPurchaseRequest(requestId)
        .call()
        .then((request) => ({
          requestId: requestId.toString(),
          buyer: request.buyer,
          brandTokenId: request.brandTokenId.toString(),
          artistTokenIds: request.artistTokenIds.map((id) => id.toString()),
          totalAmount: web3.utils.fromWei(request.totalAmount, "ether"),
          timestamp: request.timestamp.toString(),
          isConfirmed: request.isConfirmed,
          isCancelled: request.isCancelled,
          nftTokenId: request.nftTokenId.toString(),
          status: request.isConfirmed
            ? "confirmed"
            : request.isCancelled
            ? "cancelled"
            : "pending",
        }))
        .catch((err) => {
          logger.error(`Failed to fetch request ${requestId}:`, err);
          return null;
        })
    );

    const requests = (await Promise.all(requestPromises)).filter(
      (r) => r !== null
    );

    res.json({
      success: true,
      data: {
        requests: stringifyBigInts(requests.reverse()),
        totalCount: requests.length,
      },
    });
  } catch (error) {
    logger.error("[Personal NFT] getMyPurchaseRequests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase requests.",
      error: error.message,
    });
  }
};

/**
 * @notice 구매 요청 상세 조회
 * @route GET /api/nft/personal/request/:requestId
 */
const getPurchaseRequest = async (req, res) => {
  const { requestId } = req.params;

  try {
    if (requestId === undefined) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const request = await personalNFTContract.methods
      .getPurchaseRequest(requestId)
      .call();

    if (request.buyer === "0x0000000000000000000000000000000000000000") {
      return res.status(404).json({
        success: false,
        message: "Purchase request not found.",
      });
    }

    res.json({
      success: true,
      data: stringifyBigInts({
        requestId: requestId,
        buyer: request.buyer,
        brandTokenId: request.brandTokenId.toString(),
        artistTokenIds: request.artistTokenIds.map((id) => id.toString()),
        totalAmount: web3.utils.fromWei(request.totalAmount, "ether"),
        timestamp: request.timestamp.toString(),
        isConfirmed: request.isConfirmed,
        isCancelled: request.isCancelled,
        nftTokenId: request.nftTokenId.toString(),
        status: request.isConfirmed
          ? "confirmed"
          : request.isCancelled
          ? "cancelled"
          : "pending",
      }),
    });
  } catch (error) {
    logger.error("[Personal NFT] getPurchaseRequest error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase request.",
      error: error.message,
    });
  }
};

/**
 * @notice 내 Personal NFT 목록 조회
 * @route GET /api/nft/personal/my
 */
const getMyPersonalNFTs = async (req, res) => {
  const accessToken = req.token;

  try {
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Access token is required.",
      });
    }

    const walletInfo = await walletService.getWallet(accessToken);
    const userWalletAddress = walletInfo.address;

    const totalSupply = await personalNFTContract.methods.totalSupply().call();

    const nftPromises = [];
    for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
      nftPromises.push(
        personalNFTContract.methods
          .ownerOf(tokenId)
          .call()
          .then(async (owner) => {
            if (owner.toLowerCase() === userWalletAddress.toLowerCase()) {
              const tokenURI = await personalNFTContract.methods
                .tokenURI(tokenId)
                .call();

              const ipfsTokenURI = toIpfsUrl(tokenURI);
              const imageUrl = await fetchMetadataImage(tokenURI);

              return {
                tokenId: tokenId.toString(),
                owner: owner,
                tokenURI: ipfsTokenURI,
                imageUrl: imageUrl, // 이미지 URL 직접 포함
                contract: personalNFTContract.options.address,
              };
            }
            return null;
          })
          .catch(() => null)
      );
    }

    const myNFTs = (await Promise.all(nftPromises)).filter(
      (nft) => nft !== null
    );

    res.json({
      success: true,
      data: {
        nfts: stringifyBigInts(myNFTs),
        totalCount: myNFTs.length,
      },
    });
  } catch (error) {
    logger.error("[Personal NFT] getMyPersonalNFTs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch my Personal NFTs.",
      error: error.message,
    });
  }
};

/**
 * @notice Personal NFT 상세 조회
 * @route GET /api/nft/personal/:tokenId
 */
const getPersonalNFTInfo = async (req, res) => {
  const { tokenId } = req.params;

  try {
    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required.",
      });
    }

    const exists = await personalNFTContract.methods.exists(tokenId).call();

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Personal NFT not found.",
      });
    }

    const owner = await personalNFTContract.methods.ownerOf(tokenId).call();
    const tokenURI = await personalNFTContract.methods.tokenURI(tokenId).call();

    const ipfsTokenURI = toIpfsUrl(tokenURI);
    const imageUrl = await fetchMetadataImage(tokenURI);

    res.json({
      success: true,
      data: stringifyBigInts({
        tokenId: tokenId,
        owner: owner,
        tokenURI: ipfsTokenURI,
        imageUrl: imageUrl, // 이미지 URL 직접 포함
        contract: personalNFTContract.options.address,
      }),
    });
  } catch (error) {
    logger.error("[Personal NFT] getPersonalNFTInfo error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Personal NFT info.",
      error: error.message,
    });
  }
};

/**
 * @notice 가격 계산
 * @route POST /api/nft/personal/calculate-price
 */
const calculatePrice = async (req, res) => {
  const { brandTokenId, artistTokenIds } = req.body;

  try {
    if (
      brandTokenId === undefined ||
      !artistTokenIds ||
      !Array.isArray(artistTokenIds)
    ) {
      return res.status(400).json({
        success: false,
        message: "brandTokenId and artistTokenIds (array) are required.",
      });
    }

    const totalPrice = await personalNFTContract.methods
      .calculatePrice(brandTokenId, artistTokenIds)
      .call();

    res.json({
      success: true,
      data: {
        brandTokenId: brandTokenId.toString(),
        artistTokenIds: artistTokenIds.map((id) => id.toString()),
        totalPrice: web3.utils.fromWei(totalPrice, "ether"),
        unit: "DP",
      },
    });
  } catch (error) {
    logger.error("[Personal NFT] calculatePrice error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate price.",
      error: error.message,
    });
  }
};

/**
 * @notice TxHash로 정산 내역 조회
 * @route GET /api/nft/personal/distribution/:txHash
 */
const getDistributionByTxHash = async (req, res) => {
  const { txHash } = req.params;

  try {
    // 1. 트랜잭션 Receipt 조회
    const receipt = await web3.eth.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (!receipt.status) {
      return res.status(400).json({
        success: false,
        message: "Transaction failed",
      });
    }

    // 2. FundsDistributed 이벤트 시그니처 계산
    const fundsDistributedSignature = web3.eth.abi.encodeEventSignature(
      "FundsDistributed(uint256,uint256,address,uint256,address[],uint256[],address,uint256,uint256)"
    );

    // 3. PersonalNFT 컨트랙트의 FundsDistributed 이벤트 필터링
    const fundsDistributedEvent = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() ===
          personalNFTContract._address.toLowerCase() &&
        log.topics[0] === fundsDistributedSignature
    );

    if (!fundsDistributedEvent) {
      return res.status(404).json({
        success: false,
        message: "FundsDistributed event not found in this transaction",
        debug: {
          txHash,
          personalNFTAddress: personalNFTContract._address,
          expectedSignature: fundsDistributedSignature,
          logsCount: receipt.logs.length,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            topic0: log.topics[0],
          })),
        },
      });
    }

    // 4. 이벤트 디코딩
    const decodedEvent = web3.eth.abi.decodeLog(
      [
        { type: "uint256", name: "requestId", indexed: true },
        { type: "uint256", name: "nftTokenId", indexed: true },
        { type: "address", name: "brandOwner" },
        { type: "uint256", name: "brandAmount" },
        { type: "address[]", name: "artistOwners" },
        { type: "uint256[]", name: "artistAmounts" },
        { type: "address", name: "platformFeeCollector" },
        { type: "uint256", name: "platformFee" },
        { type: "uint256", name: "timestamp" },
      ],
      fundsDistributedEvent.data,
      fundsDistributedEvent.topics.slice(1) // indexed 파라미터는 topics에 있음
    );

    // 5. 정산 내역 포맷팅
    const distribution = {
      requestId: String(decodedEvent.requestId),
      nftTokenId: String(decodedEvent.nftTokenId),
      timestamp: new Date(
        parseInt(decodedEvent.timestamp) * 1000
      ).toISOString(),
      brand: {
        owner: decodedEvent.brandOwner,
        amount: web3.utils.fromWei(String(decodedEvent.brandAmount), "ether"),
        amountWei: String(decodedEvent.brandAmount),
      },
      artists: decodedEvent.artistOwners.map((owner, index) => ({
        owner,
        amount: web3.utils.fromWei(
          String(decodedEvent.artistAmounts[index]),
          "ether"
        ),
        amountWei: String(decodedEvent.artistAmounts[index]),
      })),
      platform: {
        collector: decodedEvent.platformFeeCollector,
        fee: web3.utils.fromWei(String(decodedEvent.platformFee), "ether"),
        feeWei: String(decodedEvent.platformFee),
      },
      transaction: {
        hash: txHash,
        blockNumber: String(receipt.blockNumber),
        from: receipt.from,
        to: receipt.to,
        gasUsed: String(receipt.gasUsed),
      },
    };

    // 6. 총 분배 금액 계산
    const totalDistributed =
      BigInt(decodedEvent.brandAmount) +
      decodedEvent.artistAmounts.reduce(
        (sum, amount) => sum + BigInt(amount),
        BigInt(0)
      ) +
      BigInt(decodedEvent.platformFee);

    distribution.summary = {
      totalDistributed: web3.utils.fromWei(
        totalDistributed.toString(),
        "ether"
      ),
      totalDistributedWei: totalDistributed.toString(),
      brandCount: 1,
      artistCount: decodedEvent.artistOwners.length,
      platformFee: web3.utils.fromWei(
        String(decodedEvent.platformFee),
        "ether"
      ),
    };

    return res.status(200).json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    logger.error("Error getting distribution by txHash:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get distribution details",
      error: error.message,
    });
  }
};

/**
 * @notice 플랫폼 수수료 조회
 * @route GET /api/nft/personal/platform-fee
 */
const getPlatformFee = async (req, res) => {
  try {
    const feePercentage = await personalNFTContract.methods
      .platformFeePercentage()
      .call();

    const feeCollector = await personalNFTContract.methods
      .platformFeeCollector()
      .call();

    const feeDisplay = (parseInt(feePercentage) / 100).toFixed(2) + "%";

    return res.status(200).json({
      success: true,
      data: {
        feePercentage: feePercentage.toString(),
        feeDisplay,
        feeCollector,
        description: "100 basis points = 1%, 1000 basis points = 10%",
      },
    });
  } catch (error) {
    logger.error("[Personal NFT] getPlatformFee error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get platform fee",
      error: error.message,
    });
  }
};

/**
 * @notice 플랫폼 수수료 설정 (관리자 전용)
 * @route POST /api/nft/personal/platform-fee
 */
const setPlatformFee = async (req, res) => {
  const { feePercentage, devicePassword, storedWalletData } = req.body;
  const accessToken = req.token;

  try {
    // 1. 필수 파라미터 검증
    if (
      !accessToken ||
      feePercentage === undefined ||
      !devicePassword ||
      !storedWalletData
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required. feePercentage, devicePassword, storedWalletData",
      });
    }

    // 2. 수수료 범위 검증 (0% ~ 10%)
    const feeValue = parseInt(feePercentage);
    if (isNaN(feeValue) || feeValue < 0 || feeValue > 1000) {
      return res.status(400).json({
        success: false,
        message: "Fee percentage must be between 0 and 1000 (0% ~ 10%)",
      });
    }

    // 3. 현재 수수료 조회
    const currentFee = await personalNFTContract.methods
      .platformFeePercentage()
      .call();

    logger.info("[Personal NFT] Setting platform fee:", {
      currentFee: currentFee.toString(),
      newFee: feeValue,
      admin: storedWalletData.sid,
    });

    // 4. 트랜잭션 데이터 생성
    const txData = {
      to: personalNFTContract.options.address,
      data: personalNFTContract.methods
        .setPlatformFeePercentage(feeValue)
        .encodeABI(),
      value: "0",
    };

    // 5. MPC 서비스로 트랜잭션 실행
    const receipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      txData,
      accessToken
    );

    logger.info(
      `[Personal NFT] Platform fee updated. Tx Hash: ${receipt.transactionHash}`
    );

    return res.json({
      success: true,
      message: `Platform fee updated from ${(
        parseInt(currentFee) / 100
      ).toFixed(2)}% to ${(feeValue / 100).toFixed(2)}%`,
      data: {
        txHash: receipt.transactionHash,
        oldFee: currentFee.toString(),
        newFee: feeValue.toString(),
        oldFeeDisplay: (parseInt(currentFee) / 100).toFixed(2) + "%",
        newFeeDisplay: (feeValue / 100).toFixed(2) + "%",
      },
    });
  } catch (error) {
    logger.error("[Personal NFT] setPlatformFee error:", error);

    if (error.message && error.message.includes("Ownable")) {
      return res.status(403).json({
        success: false,
        message: "Only the contract owner can update the platform fee",
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to set platform fee",
      error: error.message,
    });
  }
};

module.exports = {
  // 구매 플로우
  requestPurchase,
  confirmPurchase,
  cancelPurchase,
  // 조회
  getMyPurchaseRequests,
  getPurchaseRequest,
  getMyPersonalNFTs,
  getPersonalNFTInfo,
  calculatePrice,
  // 정산 조회
  getDistributionByTxHash,
  // 수수료 관리
  getPlatformFee,
  setPlatformFee,
};
