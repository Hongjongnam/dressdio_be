const {
  web3,
  dpTokenContract,
  creatorSBTContract,
  getIpNftContract,
  ipnftFactoryContract,
} = require("../../config/web3");
const logger = require("../../utils/logger");
const { stringifyBigInts } = require("../../utils/utils");
const { uploadJSONToIPFS, uploadFileToIPFS } = require("../../services/upload");
const walletService = require("../../services/wallet");
const mpcService = require("../../services/blockchainMPC");
const axios = require("axios");
const path = require("path");

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

// Helper function to build full IPFS URL
const toIpfsUrl = (uri) => {
  if (!uri || !uri.startsWith("ipfs://")) {
    return uri;
  }
  return uri.replace("ipfs://", IPFS_GATEWAY);
};

// Helper function to clean struct from contract call
const _cleanStruct = (struct) => {
  if (!struct || typeof struct !== "object") {
    return struct;
  }
  const newObj = {};
  Object.keys(struct).forEach((key) => {
    if (isNaN(parseInt(key, 10))) {
      newObj[key] = struct[key];
    }
  });
  delete newObj["__length__"];
  return newObj;
};

// Helper function to format IPNFT data consistently
const _formatIpNftData = async (tokenInfo, tokenId) => {
  if (
    !tokenInfo ||
    !tokenInfo.creator ||
    tokenInfo.creator === "0x0000000000000000000000000000000000000000"
  ) {
    return null;
  }

  let sbtInfo = null;
  try {
    const rawSbtInfo = await creatorSBTContract.methods
      .getSBTInfoById(tokenInfo.creatorSBTId)
      .call();
    sbtInfo = _cleanStruct(rawSbtInfo);
  } catch (e) {
    logger.warn(
      `Could not fetch SBT info for SBT ID ${tokenInfo.creatorSBTId}: ${e.message}`
    );
  }

  const formatted = {
    tokenId: tokenId.toString(),
    creator: tokenInfo.creator,
    owner: tokenInfo.owner,
    creatorSBTId: tokenInfo.creatorSBTId.toString(),
    name: tokenInfo.name,
    description: tokenInfo.description,
    image: toIpfsUrl(tokenInfo.ipfsImage),
    price: web3.utils.fromWei(tokenInfo.price.toString(), "ether"),
    supplyPrice: web3.utils.fromWei(tokenInfo.supplyPrice.toString(), "ether"),
    creatorSBT: sbtInfo ? stringifyBigInts(sbtInfo) : null,
  };
  return stringifyBigInts(formatted);
};

/**
 * IPNFT 발행 (DP 소모)
 * @param {Object} req - Express request object
 * @param {string} req.token - 액세스 토큰 (헤더에서)
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {string} req.body.ipfsImage - IPFS 이미지 URL
 * @param {string} req.body.name - IPNFT 이름
 * @param {string} req.body.description - IPNFT 설명
 * @param {string} req.body.price - 가격 (DP)
 * @param {string} req.body.supplyPrice - 공급 가격 (DP)
 * @param {string} req.body.creatorType - 크리에이터 타입
 * @param {Object} res - Express response object
 */
const mintIpNft = async (req, res) => {
  const {
    devicePassword,
    storedWalletData,
    ipfsImage,
    name,
    description,
    price,
    supplyPrice,
    creatorType,
  } = req.body;
  const accessToken = req.token; // 헤더에서 accessToken 가져오기

  try {
    // 1. 필수 파라미터 검증
    if (
      !accessToken ||
      !devicePassword ||
      !storedWalletData ||
      !name ||
      !description ||
      !price ||
      !supplyPrice ||
      !creatorType
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required. (accessToken from header)",
      });
    }

    const ipnftContract = getIpNftContract();
    const userWalletAddress = storedWalletData.sid;

    // 2. 사용자 SBT 확인
    const sbtInfoList = await creatorSBTContract.methods
      .getSBTInfoByAddress(userWalletAddress)
      .call();

    const normalizedCreatorType = creatorType.toLowerCase();
    const creatorSbt = sbtInfoList.find(
      (sbt) => sbt.creatorType.toLowerCase() === normalizedCreatorType
    );

    if (!creatorSbt) {
      return res.status(404).json({
        success: false,
        message: `User does not own a '${normalizedCreatorType}' type SBT.`,
      });
    }
    const creatorSBTId = creatorSbt.tokenId;

    // 3. 이미지 재업로드 (IPFS 최적화)
    const imageResponse = await axios.get(ipfsImage, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data, "binary");
    const imageUrlObject = new URL(ipfsImage);
    const imageName = path.basename(imageUrlObject.pathname);
    const newImageIpfsUri = await uploadFileToIPFS(imageBuffer, imageName);

    // 4. 메타데이터 업로드
    const metadata = { name, description, image: newImageIpfsUri };
    const tokenURI = await uploadJSONToIPFS(metadata);

    const priceInWei = web3.utils.toWei(price.toString(), "ether");
    const supplyPriceInWei = web3.utils.toWei(supplyPrice.toString(), "ether");

    // 5. 민팅 수수료 확인 및 승인
    const mintFee = await ipnftFactoryContract.methods.getMintingFee().call();
    const dpBalance = await dpTokenContract.methods
      .balanceOf(userWalletAddress)
      .call();

    if (BigInt(dpBalance) < BigInt(mintFee)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient DP balance for minting fee. Required: ${web3.utils.fromWei(
          mintFee,
          "ether"
        )} DP`,
      });
    }

    const approveTxData = {
      to: dpTokenContract.options.address,
      data: dpTokenContract.methods
        .approve(ipnftFactoryContract.options.address, mintFee)
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
      `[IPNFT Mint] Fee approval transaction hash: ${approveReceipt.transactionHash}`
    );

    // 6. IPNFT 민팅
    const mintTxData = {
      to: ipnftFactoryContract.options.address,
      data: ipnftFactoryContract.methods
        .createToken(
          newImageIpfsUri,
          name,
          description,
          priceInWei,
          supplyPriceInWei,
          creatorSBTId,
          tokenURI // 추가: 메타데이터 URI 전달
        )
        .encodeABI(),
      value: "0",
    };

    const mintReceipt = await mpcService.executeTransactionWithStoredData(
      storedWalletData,
      devicePassword,
      mintTxData,
      accessToken
    );

    // 7. TokenID 파싱
    const tokenMintedEventABI = ipnftFactoryContract.options.jsonInterface.find(
      (e) => e.name === "TokenMinted" && e.type === "event"
    );
    let tokenId = null;
    if (tokenMintedEventABI) {
      const eventLog = mintReceipt.logs.find(
        (log) => log.topics[0] === tokenMintedEventABI.signature
      );
      if (eventLog) {
        const decodedLog = web3.eth.abi.decodeLog(
          tokenMintedEventABI.inputs,
          eventLog.data,
          eventLog.topics.slice(1)
        );
        tokenId = decodedLog.tokenId.toString();
      }
    }

    const metadataForResponse = {
      ...metadata,
      image: toIpfsUrl(newImageIpfsUri),
    };

    res.json({
      success: true,
      message: "IPNFT minted successfully!",
      txHash: mintReceipt.transactionHash,
      tokenId: tokenId,
      tokenURI: toIpfsUrl(tokenURI),
      metadata: metadataForResponse,
    });
  } catch (error) {
    logger.error("Error minting IPNFT:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mint IPNFT.",
      error: error.message,
    });
  }
};

/**
 * 전체 IPNFT 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllIpNfts = async (req, res) => {
  try {
    const ipnftContract = getIpNftContract();
    const totalSupply = await ipnftContract.methods.getCurrentTokenId().call();

    const tokenPromises = [];
    for (let i = 0; i < totalSupply; i++) {
      tokenPromises.push(
        ipnftContract.methods
          .getTokenInfo(i)
          .call()
          .then((tokenInfo) => _formatIpNftData(tokenInfo, i))
      );
    }

    const allTokens = (await Promise.all(tokenPromises)).filter(
      (t) => t !== null
    );

    res.json({ success: true, nfts: allTokens.reverse() });
  } catch (error) {
    logger.error("Error fetching all IPNFTs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get all IPNFTs",
      error: error.message,
    });
  }
};

/**
 * 내 IPNFT 목록 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMyIpNfts = async (req, res) => {
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

    if (!userWalletAddress) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found for this user.",
      });
    }

    const ipnftContract = getIpNftContract();
    const totalSupply = await ipnftContract.methods.getCurrentTokenId().call();

    const tokenPromises = [];
    for (let i = 0; i < totalSupply; i++) {
      tokenPromises.push(ipnftContract.methods.getTokenInfo(i).call());
    }
    const allTokensInfo = await Promise.all(tokenPromises);

    const myTokens = [];
    for (let i = 0; i < allTokensInfo.length; i++) {
      const tokenInfo = allTokensInfo[i];
      if (
        tokenInfo &&
        tokenInfo.owner &&
        tokenInfo.owner.toLowerCase() === userWalletAddress.toLowerCase()
      ) {
        const formatted = await _formatIpNftData(tokenInfo, i);
        if (formatted) {
          myTokens.push(formatted);
        }
      }
    }

    res.json({ success: true, nfts: myTokens.reverse() });
  } catch (error) {
    logger.error("Error fetching my IPNFTs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get your IPNFTs.",
      error: error.message,
    });
  }
};

/**
 * IPNFT 정보 조회 (Token ID로)
 * @param {Object} req - Express request object
 * @param {string} req.params.tokenId - 토큰 ID
 * @param {Object} res - Express response object
 */
const getIpNftInfo = async (req, res) => {
  const { tokenId } = req.params;

  try {
    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required.",
      });
    }

    const ipnftContract = getIpNftContract();
    const tokenInfo = await ipnftContract.methods.getTokenInfo(tokenId).call();
    const nftData = await _formatIpNftData(tokenInfo, tokenId);

    if (!nftData) {
      return res.status(404).json({
        success: false,
        message: "IPNFT not found.",
      });
    }

    // tokenURI도 함께 반환
    let tokenURI = null;
    try {
      tokenURI = await ipnftContract.methods.tokenURI(tokenId).call();
    } catch (e) {
      tokenURI = null;
    }

    res.json({ success: true, nft: { ...nftData, tokenURI } });
  } catch (error) {
    logger.error(`Error fetching IPNFT info for token ${tokenId}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to get IPNFT information.",
      error: error.message,
    });
  }
};

/**
 * IPNFT 발행 수수료 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMintingFee = async (req, res) => {
  try {
    const fee = await ipnftFactoryContract.methods.getMintingFee().call();
    res.json({
      success: true,
      fee: web3.utils.fromWei(fee.toString(), "ether"),
      unit: "DP",
    });
  } catch (error) {
    logger.error("Error fetching minting fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get minting fee.",
      error: error.message,
    });
  }
};

/**
 * IPNFT 발행 수수료 변경 (Owner Only)
 * @param {Object} req - Express request object
 * @param {string} req.token - 액세스 토큰 (헤더에서)
 * @param {string} req.body.devicePassword - 장치 비밀번호
 * @param {Object} req.body.storedWalletData - 저장된 지갑 데이터
 * @param {string} req.body.newFee - 새로운 수수료
 * @param {Object} res - Express response object
 */
const setMintingFee = async (req, res) => {
  const { devicePassword, storedWalletData, newFee } = req.body;
  const accessToken = req.token; // 헤더에서 accessToken 가져오기

  try {
    if (!accessToken || !devicePassword || !storedWalletData || !newFee) {
      return res.status(400).json({
        success: false,
        message: "All fields are required. (accessToken from header)",
      });
    }

    const newFeeInWei = web3.utils.toWei(newFee.toString(), "ether");
    const txData = {
      to: ipnftFactoryContract.options.address,
      data: ipnftFactoryContract.methods.setMintingFee(newFeeInWei).encodeABI(),
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
      message: "Minting fee updated successfully.",
      txHash: receipt.transactionHash,
    });
  } catch (error) {
    logger.error("Error setting minting fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to set minting fee.",
      error: error.message,
    });
  }
};

/**
 * 이미지 업로드 후 IPFS URI 반환
 * @param {Object} req - Express request object
 * @param {Object} req.file - 업로드된 파일
 * @param {Object} res - Express response object
 */
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded.",
      });
    }

    const ipfsUri = await uploadFileToIPFS(
      req.file.buffer,
      req.file.originalname
    );

    res.status(200).json({
      success: true,
      message: "File uploaded to IPFS successfully.",
      ipfsUri: ipfsUri,
      ipfsUrl: toIpfsUrl(ipfsUri),
    });
  } catch (error) {
    logger.error("Error uploading image to IPFS:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  mintIpNft,
  getAllIpNfts,
  getMyIpNfts,
  getIpNftInfo,
  getMintingFee,
  setMintingFee,
  uploadImage,
};
