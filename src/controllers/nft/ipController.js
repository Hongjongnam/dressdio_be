const {
  web3,
  dressdioAdminAccount,
  checkConnection,
} = require("../../config/web3");
const ipContractABI = require("../../abi/IpContract.json");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const IP_CONTRACT_ADDRESS = process.env.IP_CONTRACT_ADDRESS;
const API_BASE_URL = process.env.API_BASE_URL || "https://fs.dressdio.me";

// IP NFT 컨트랙트 인스턴스 생성
const ipContract = new web3.eth.Contract(ipContractABI, IP_CONTRACT_ADDRESS);

/**
 * SBT 정보 조회 함수
 * @param {string} walletAddress - 지갑 주소
 * @returns {Promise<Object>} SBT 정보
 */
const getSBTInfo = async (walletAddress) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/nft/sbt/${walletAddress}`
    );
    if (response.data.status === "success" && response.data.data.length > 0) {
      return response.data.data[0]; // 첫 번째 SBT 정보 반환
    }
    return null;
  } catch (error) {
    console.error("SBT info retrieval error:", error);
    return null;
  }
};

/**
 * IP NFT 정보 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.tokenId - IP NFT 토큰 ID
 * @param {Object} res - Express response object
 */
const getIPNFT = async (req, res) => {
  try {
    const { tokenId } = req.params;

    // 1. 필수 파라미터 검증
    if (!tokenId) {
      return res.status(400).json({
        status: "error",
        message: "Token ID is required",
      });
    }

    // 2. 토큰 ID 형식 검증
    if (isNaN(tokenId) || tokenId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid token ID format",
      });
    }

    // 3. IP NFT 데이터 조회
    const ipNFTData = await ipContract.methods.getIPNFTData(tokenId).call();

    // 4. 결과가 없는 경우
    if (!ipNFTData || !ipNFTData.sbtTokenId) {
      return res.status(404).json({
        status: "error",
        message: "IP NFT not found",
      });
    }

    // 5. 토큰 URI 조회
    const tokenURI = await ipContract.methods.tokenURI(tokenId).call();

    // 6. 소유자 주소 조회
    const owner = await ipContract.methods.ownerOf(tokenId).call();

    // 7. SBT 정보 조회
    const sbtInfo = await getSBTInfo(owner);

    // 8. 응답 데이터 포맷팅
    const formattedData = {
      tokenId: tokenId.toString(),
      owner: owner,
      sbtTokenId: ipNFTData.sbtTokenId.toString(),
      creatorType: ipNFTData.creatorType,
      tokenURI: tokenURI,
      sbtInfo: sbtInfo
        ? {
            tokenId: sbtInfo.tokenId,
            owner: sbtInfo.owner,
            creatorType: sbtInfo.creatorType,
            description: sbtInfo.description,
            tokenURI: sbtInfo.tokenURI,
          }
        : null,
    };

    // 9. 성공 응답
    res.status(200).json({
      status: "success",
      message: "IP NFT info retrieved successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("IP NFT retrieval error:", error);

    // 에러 메시지 개선
    let errorMessage = "Failed to retrieve IP NFT info";
    if (error.reason) {
      errorMessage += `: ${error.reason}`;
    } else if (error.message) {
      errorMessage += `: ${error.message}`;
    }

    res.status(500).json({
      status: "error",
      message: errorMessage,
      error: error.message,
    });
  }
};

/**
 * SBT 토큰 ID로 IP NFT 목록 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.sbtTokenId - SBT 토큰 ID
 * @param {Object} res - Express response object
 */
const getIPNFTsBySBTTokenId = async (req, res) => {
  try {
    const { sbtTokenId } = req.params;

    // 1. 필수 파라미터 검증
    if (!sbtTokenId) {
      return res.status(400).json({
        status: "error",
        message: "SBT Token ID is required",
      });
    }

    // 2. SBT 토큰 ID 형식 검증
    if (isNaN(sbtTokenId) || sbtTokenId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid SBT Token ID format",
      });
    }

    // 3. 컨트랙트에서 IP NFT 목록 조회
    const tokenIds = await ipContract.methods
      .getIPNFTsBySBTTokenId(sbtTokenId)
      .call();

    if (!tokenIds || tokenIds.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No IP NFTs found for this SBT Token ID",
      });
    }

    // 4. 각 IP NFT의 상세 정보 조회
    const ipNFTs = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const ipNFTData = await ipContract.methods.getIPNFTData(tokenId).call();
        const tokenURI = await ipContract.methods.tokenURI(tokenId).call();
        const owner = await ipContract.methods.ownerOf(tokenId).call();

        // SBT 정보 조회
        const sbtInfo = await getSBTInfo(owner);

        return {
          tokenId: tokenId.toString(),
          owner: owner,
          sbtTokenId: ipNFTData.sbtTokenId.toString(),
          creatorType: ipNFTData.creatorType,
          tokenURI: tokenURI,
          sbtInfo: sbtInfo
            ? {
                tokenId: sbtInfo.tokenId,
                owner: sbtInfo.owner,
                creatorType: sbtInfo.creatorType,
                description: sbtInfo.description,
                tokenURI: sbtInfo.tokenURI,
              }
            : null,
        };
      })
    );

    // 5. 성공 응답
    res.status(200).json({
      status: "success",
      message: "IP NFTs retrieved successfully",
      data: ipNFTs,
    });
  } catch (error) {
    console.error("IP NFTs retrieval error:", error);

    // 에러 메시지 개선
    let errorMessage = "Failed to retrieve IP NFTs";
    if (error.reason) {
      errorMessage += `: ${error.reason}`;
    } else if (error.message) {
      errorMessage += `: ${error.message}`;
    }

    res.status(500).json({
      status: "error",
      message: errorMessage,
      error: error.message,
    });
  }
};

/**
 * 모든 IP NFT 정보 조회
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllIPNFTs = async (req, res) => {
  try {
    // 컨트랙트에서 모든 IP NFT 정보 조회
    const ipNFTInfos = await ipContract.methods.getAllIPNFTs().call();

    if (!ipNFTInfos || ipNFTInfos.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No IP NFTs found",
      });
    }

    // BigInt 값을 문자열로 변환하여 응답 데이터 포맷팅
    const formattedIPNFTs = ipNFTInfos.map((ipNFT) => ({
      tokenId: ipNFT.tokenId.toString(),
      owner: ipNFT.owner,
      sbtTokenId: ipNFT.sbtTokenId.toString(),
      creatorType: ipNFT.creatorType,
      tokenURI: ipNFT.tokenURI,
      sbtDescription: ipNFT.sbtDescription,
      sbtTokenURI: ipNFT.sbtTokenURI,
    }));

    res.status(200).json({
      status: "success",
      message: "All IP NFTs retrieved successfully",
      data: formattedIPNFTs,
    });
  } catch (error) {
    console.error("IP NFTs retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve IP NFTs",
      error: error.message,
    });
  }
};

/**
 * IP NFT 민팅
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing minting data
 * @param {number} req.body.sbtTokenId - SBT 토큰 ID
 * @param {string} req.body.ipName - IP NFT 이름
 * @param {string} req.body.description - IP NFT 설명
 * @param {string} req.body.imageFile - 이미지 파일 데이터
 * @param {number} req.body.price - 가격
 * @param {number} req.body.priceSupply - 공급량
 * @param {string} req.body.accessToken - 인증 토큰
 * @param {Object} res - Express response object
 */
const mintIPNFT = async (req, res) => {
  try {
    const {
      sbtTokenId,
      ipName,
      description,
      imageFile,
      price,
      priceSupply,
      accessToken,
    } = req.body;

    // 1. 필수 파라미터 검증
    if (
      !sbtTokenId ||
      !ipName ||
      !description ||
      !imageFile ||
      !price ||
      !priceSupply ||
      !accessToken
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "All fields are required: sbtTokenId, ipName, description, imageFile, price, priceSupply, accessToken",
      });
    }

    // 2. 데이터 타입 및 형식 검증
    if (isNaN(sbtTokenId) || sbtTokenId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid sbtTokenId format",
      });
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid price format",
      });
    }

    if (isNaN(priceSupply) || priceSupply <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid priceSupply format",
      });
    }

    // 3. 데이터 길이 검증
    if (ipName.length > 100) {
      return res.status(400).json({
        status: "error",
        message: "ipName is too long (max 100 characters)",
      });
    }

    if (description.length > 1000) {
      return res.status(400).json({
        status: "error",
        message: "description is too long (max 1000 characters)",
      });
    }

    if (!accessToken || typeof accessToken !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Invalid accessToken format",
      });
    }

    // 4. 요청 데이터 로깅 (개발용)
    console.log("Received minting request:", {
      sbtTokenId,
      ipName,
      description,
      imageFile: "Image data received",
      price,
      priceSupply,
      accessToken,
    });

    // 5. 임시 성공 응답 (추후 실제 민팅 로직 구현 예정)
    res.status(200).json({
      status: "success",
      message: "Minting request received successfully",
      data: {
        sbtTokenId,
        ipName,
        description,
        price,
        priceSupply,
        accessToken,
      },
    });
  } catch (error) {
    console.error("IP NFT minting error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to process minting request",
      error: error.message,
    });
  }
};

module.exports = {
  getIPNFT,
  getIPNFTsBySBTTokenId,
  getAllIPNFTs,
  mintIPNFT,
};
