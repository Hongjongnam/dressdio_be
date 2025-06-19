const logger = require("../../utils/logger");
const SBT = require("../../models/sbt");

/**
 * IP NFT 민팅
 * @route POST /api/nft/ip/mint
 */
exports.mint = async (req, res) => {
  try {
    console.log("[IP NFT Mint] req.body:", req.body);
    const { address, creatorType } = req.body;
    if (!address) {
      return res.status(400).json({
        status: "error",
        message: "address is required in request body",
      });
    }
    if (!creatorType) {
      return res.status(400).json({
        status: "error",
        message: "creatorType is required in request body",
      });
    }
    const normalizedType = creatorType.toLowerCase();
    if (normalizedType !== "artist" && normalizedType !== "brand") {
      return res.status(400).json({
        status: "error",
        message: "Only artist or brand creatorType can mint IP NFT.",
      });
    }

    // SBT 정보 DB에서 owner+creatorType으로 조회
    const sbtInfo = await SBT.findOne({
      where: { owner: address, creatorType: normalizedType },
    });
    if (!sbtInfo) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address and creatorType",
      });
    }

    // 필요한 필드만 추려서 반환
    const sbtData = {
      tokenId: sbtInfo.tokenId,
      owner: sbtInfo.owner,
      creatorType: sbtInfo.creatorType,
      description: sbtInfo.description,
      tokenURI: sbtInfo.tokenURI,
      transactionHash: sbtInfo.transactionHash,
      useCount: sbtInfo.useCount,
      createdAt: sbtInfo.createdAt,
      updatedAt: sbtInfo.updatedAt,
    };

    return res.status(200).json({
      status: "success",
      message: "SBT found for this wallet address and creatorType",
      data: sbtData,
    });
  } catch (error) {
    logger.error("IP NFT minting error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to mint IP NFT",
      error: error.message,
    });
  }
};

/**
 * IP NFT 정보 조회
 * @route GET /api/nft/ip/:tokenId
 */
exports.getIpNftByTokenId = async (req, res) => {
  try {
    const { tokenId } = req.params;
    // TODO: IP NFT 컨트랙트에서 tokenId로 정보 조회

    // 예시 응답
    return res.status(200).json({
      status: "success",
      message: "IP NFT info retrieved successfully",
      data: {
        tokenId,
        // ipnftInfo: { ... }
      },
    });
  } catch (error) {
    logger.error("IP NFT retrieval error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve IP NFT info",
      error: error.message,
    });
  }
};
