const logger = require("../../utils/logger");
const SBT = require("../../models/sbt");

/**
 * IP NFT 민팅
 * @route POST /api/nft/ip/mint
 */
exports.mint = async (req, res) => {
  try {
    console.log("[IP NFT Mint] req.body:");
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({
        status: "error",
        message: "address is required in request body",
      });
    }

    // SBT 정보 DB에서 조회
    const sbtInfo = await SBT.findOne({ where: { owner: address } });
    if (!sbtInfo) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address",
      });
    }

    // TODO: SBT 정보 조회 및 IP NFT 민팅 트랜잭션 실행

    // 예시 응답
    return res.status(200).json({
      status: "success",
      message: "SBT found for this wallet address",
      data: sbtInfo,
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
