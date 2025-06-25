const {
  web3,
  merchandiseFactoryContract,
  creatorSBTContract,
  ipnftFactoryContract,
  merchandiseFactoryAddress,
  creatorSBTAddress,
  ipnftFactoryAddress,
  platformRegistryAddress,
} = require("../../config/web3");
const { uploadFileToIPFS } = require("../../services/upload");
const authService = require("../../services/auth");
const walletService = require("../../services/wallet");
const blockchainService = require("../../services/blockchain");
const logger = require("../../utils/logger");
const { stringifyBigInts } = require("../../utils/utils");

// 상품 프로젝트 생성
const createProject = async (req, res) => {
  const accessToken = req.token;
  let projectImageUri = req.body.projectImageUri;

  // 데이터 정리 (따옴표 제거)
  const cleanData = (value) => {
    if (typeof value === "string") {
      return value.replace(/^["']|["']$/g, "");
    }
    return value;
  };

  const projectName = cleanData(req.body.projectName);
  const description = cleanData(req.body.description);
  const quantity = cleanData(req.body.quantity);
  const salePrice = cleanData(req.body.salePrice);
  const ipnftTokenIds = cleanData(req.body.ipnftTokenIds);

  console.log("정리된 데이터:", {
    projectName,
    description,
    quantity,
    salePrice,
    ipnftTokenIds,
    files: req.files ? req.files.length : 0,
    projectImageUri,
  });

  // 필수 필드 검증 (projectImageUri는 파일 업로드 후 설정됨)
  if (
    !projectName ||
    !description ||
    !quantity ||
    !salePrice ||
    !ipnftTokenIds
  ) {
    return res.status(400).json({
      success: false,
      message: "모든 필수 필드를 입력해주세요.",
      missing: {
        projectName: !projectName,
        description: !description,
        quantity: !quantity,
        salePrice: !salePrice,
        ipnftTokenIds: !ipnftTokenIds,
      },
    });
  }

  // IPNFT 토큰 ID 배열 처리
  let tokenIdsArray;
  if (typeof ipnftTokenIds === "string") {
    tokenIdsArray = ipnftTokenIds.split(",").map((id) => id.trim());
  } else if (Array.isArray(ipnftTokenIds)) {
    tokenIdsArray = ipnftTokenIds;
  } else {
    return res.status(400).json({
      success: false,
      message: "IPNFT 토큰 ID를 올바른 형식으로 입력해주세요.",
    });
  }

  if (tokenIdsArray.length === 0) {
    return res.status(400).json({
      success: false,
      message: "IPNFT 토큰 ID를 하나 이상 입력해주세요.",
    });
  }

  // 1. 파일이 첨부된 경우 IPFS 업로드
  if (req.files && req.files.length > 0) {
    try {
      console.log("파일 업로드 시작:", req.files[0].originalname);
      const file = req.files[0];
      projectImageUri = await uploadFileToIPFS(file.buffer, file.originalname);
      console.log("IPFS 업로드 완료:", projectImageUri);
    } catch (err) {
      console.error("IPFS 업로드 실패:", err);
      return res.status(500).json({
        success: false,
        message: "IPFS upload failed",
        error: err.message,
      });
    }
  }

  // projectImageUri가 없으면 오류
  if (!projectImageUri) {
    return res.status(400).json({
      success: false,
      message:
        "프로젝트 이미지를 업로드해주세요. (image 파일 또는 projectImageUri)",
    });
  }

  try {
    // 1. 보안 채널 생성 및 사용자 기본 정보 조회
    const secureChannel = await authService.createSecureChannel();
    const walletInfo = await walletService.getWallet(accessToken);
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      process.env.DEVICE_PASSWORD
    );
    const fullWalletData = await walletService.createWallet(
      walletInfo.email,
      encryptedDevicePassword,
      secureChannel.ChannelID,
      accessToken
    );

    console.log("지갑 정보:", walletInfo.address);

    // 2. 사용자의 SBT 목록을 조회하고 influencer 타입의 SBT가 있는지 확인
    const sbtInfoList = await creatorSBTContract.methods
      .getSBTInfoByAddress(walletInfo.address)
      .call();

    console.log("SBT 정보:", sbtInfoList);

    let hasInfluencerSBT = false;
    for (const sbtInfo of sbtInfoList) {
      if (sbtInfo.creatorType.toLowerCase() === "influencer") {
        hasInfluencerSBT = true;
        break;
      }
    }

    if (!hasInfluencerSBT) {
      return res.status(403).json({
        success: false,
        message:
          "influencer 타입의 SBT를 보유한 사용자만 상품 프로젝트를 생성할 수 있습니다.",
      });
    }

    // 3. IPNFT 소유권 검증 및 분류
    let brandIPNFTTokenId = null;
    let artistIPNFTTokenIds = [];

    for (const tokenId of tokenIdsArray) {
      try {
        // IPNFT 컨트랙트에서 직접 소유권 확인
        const ipnftAddress = await ipnftFactoryContract.methods
          .getIPNFTAddress()
          .call();
        const ipnftContract = new web3.eth.Contract(
          require("../../abi/IPNFT.json"),
          ipnftAddress
        );

        const owner = await ipnftContract.methods.ownerOf(tokenId).call();
        console.log(`IPNFT ${tokenId} 소유자:`, owner);
        if (owner.toLowerCase() !== walletInfo.address.toLowerCase()) {
          return res.status(403).json({
            success: false,
            message: `IPNFT 토큰 ID ${tokenId}를 소유하지 않았습니다. 소유자: ${owner}`,
          });
        }

        // IPNFT의 creatorType 확인 (IPNFT 컨트랙트에서 직접 조회)
        try {
          // IPNFT 컨트랙트에서 IPNFT 정보 조회
          const ipnftInfo = await ipnftContract.methods
            .getTokenInfo(tokenId)
            .call();
          console.log(`IPNFT ${tokenId} 정보:`, ipnftInfo);

          // creatorSBTId를 사용해서 SBT 정보 조회
          const creatorSBTInfo = await creatorSBTContract.methods
            .getSBTInfoById(ipnftInfo.creatorSBTId)
            .call();

          console.log(`IPNFT ${tokenId}의 SBT 정보:`, creatorSBTInfo);
          console.log(
            `IPNFT ${tokenId}의 creatorSBTId:`,
            ipnftInfo.creatorSBTId
          );
          console.log(
            `IPNFT ${tokenId}의 creatorType:`,
            creatorSBTInfo.creatorType
          );

          // SBT의 creatorType을 기반으로 IPNFT 분류
          if (
            creatorSBTInfo.creatorType &&
            creatorSBTInfo.creatorType.toLowerCase() === "brand"
          ) {
            // brand 타입 SBT를 가진 IPNFT는 brand IPNFT로 분류
            console.log(`IPNFT ${tokenId}를 브랜드로 분류합니다.`);
            if (brandIPNFTTokenId === null) {
              brandIPNFTTokenId = parseInt(tokenId);
              console.log(`브랜드 IPNFT로 설정: ${brandIPNFTTokenId}`);
            } else {
              console.log(
                `이미 브랜드 IPNFT가 설정되어 있습니다: ${brandIPNFTTokenId}`
              );
              return res.status(400).json({
                success: false,
                message: "브랜드 IPNFT는 하나만 사용할 수 있습니다.",
              });
            }
          } else if (
            creatorSBTInfo.creatorType &&
            creatorSBTInfo.creatorType.toLowerCase() === "artist"
          ) {
            // artist 타입 SBT를 가진 IPNFT는 artist IPNFT로 분류
            console.log(`IPNFT ${tokenId}를 아티스트로 분류합니다.`);
            artistIPNFTTokenIds.push(parseInt(tokenId));
            console.log(`아티스트 IPNFT 목록:`, artistIPNFTTokenIds);
          } else {
            console.log(
              `IPNFT ${tokenId}의 creatorType이 유효하지 않습니다:`,
              creatorSBTInfo.creatorType
            );
            return res.status(400).json({
              success: false,
              message: `IPNFT ${tokenId}의 creatorType이 유효하지 않습니다. (${creatorSBTInfo.creatorType})`,
            });
          }
        } catch (error) {
          console.error(`IPNFT ${tokenId} 정보 조회 오류:`, error);
          return res.status(400).json({
            success: false,
            message: `IPNFT ${tokenId} 정보를 조회할 수 없습니다.`,
          });
        }
      } catch (error) {
        console.error(`IPNFT ${tokenId} 조회 오류:`, error);
        return res.status(400).json({
          success: false,
          message: `유효하지 않은 IPNFT 토큰 ID: ${tokenId}`,
        });
      }
    }

    // brand IPNFT가 없으면 오류
    if (brandIPNFTTokenId === null) {
      return res.status(400).json({
        success: false,
        message:
          "브랜드 IPNFT가 필요합니다. (creatorType이 'brand'인 SBT를 가진 IPNFT)",
      });
    }

    // artist IPNFT가 없으면 오류
    if (artistIPNFTTokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "아티스트 IPNFT가 필요합니다. (creatorType이 'artist'인 SBT를 가진 IPNFT)",
      });
    }

    console.log("IPNFT 분류:", {
      brandIPNFTTokenId,
      artistIPNFTTokenIds,
    });

    // 디버깅: influencer SBT 검증
    try {
      console.log("Influencer SBT 검증 시작...");
      const hasInfluencerSBT = await creatorSBTContract.methods
        .hasCreatorSbt(walletInfo.address, "influencer")
        .call();
      console.log("hasCreatorSbt 결과:", hasInfluencerSBT);

      if (!hasInfluencerSBT) {
        return res.status(403).json({
          success: false,
          message: "인플루언서 SBT가 필요합니다.",
        });
      }
    } catch (sbtError) {
      console.error("SBT 검증 오류:", sbtError);
      return res.status(400).json({
        success: false,
        message: "SBT 검증 중 오류가 발생했습니다.",
        error: sbtError.message,
      });
    }

    // 디버깅: 컨트랙트 주소 확인
    console.log("컨트랙트 주소 확인:");
    console.log("- MerchandiseFactory:", merchandiseFactoryAddress);
    console.log("- CreatorSBT:", creatorSBTAddress);
    console.log("- PlatformRegistry:", platformRegistryAddress);

    // 디버깅: 각 require 조건 개별 테스트
    console.log("=== Require 조건 개별 테스트 ===");
    console.log(
      "1. totalSupply > 0:",
      parseInt(quantity) > 0,
      `(${parseInt(quantity)} > 0)`
    );
    console.log(
      "2. salePrice > 0:",
      parseInt(salePrice) > 0,
      `(${salePrice} > 0)`
    );
    console.log(
      "3. brandIPNFTTokenId >= 0:",
      brandIPNFTTokenId >= 0,
      `(${brandIPNFTTokenId} >= 0)`
    );
    console.log(
      "4. artistIPNFTTokenIds.length > 0:",
      artistIPNFTTokenIds.length > 0,
      `(${artistIPNFTTokenIds.length} > 0)`
    );
    console.log(
      "5. projectName.length > 0:",
      projectName.length > 0,
      `("${projectName}" length: ${projectName.length})`
    );
    console.log(
      "6. description.length > 0:",
      description.length > 0,
      `("${description}" length: ${description.length})`
    );
    console.log(
      "7. projectImageUri.length > 0:",
      projectImageUri.length > 0,
      `("${projectImageUri}" length: ${projectImageUri.length})`
    );
    console.log("=== Require 조건 테스트 완료 ===");

    // 4. Merchandise 프로젝트 생성 트랜잭션 처리
    try {
      console.log(
        "2025-06-25 13:09:04 info: Creating merchandise project for",
        walletInfo.address + "..."
      );

      // 트랜잭션 파라미터 로깅
      console.log("트랜잭션 파라미터:", {
        name: "MerchandiseNFT",
        symbol: "MNFT",
        projectName,
        description,
        quantity: parseInt(quantity),
        salePriceInWei: web3.utils.toWei(String(salePrice), "ether"),
        brandIPNFTTokenId,
        artistIPNFTTokenIds,
        projectImageUri,
      });

      // 가스 추정
      console.log("가스 추정 시작...");
      const merchandiseFactory = new web3.eth.Contract(
        require("../../abi/MerchandiseFactory.json"),
        merchandiseFactoryAddress
      );
      const salePriceInWei = web3.utils.toWei(String(salePrice), "ether");
      const gasEstimate = await merchandiseFactory.methods
        .createMerchandiseProject(
          "MerchandiseNFT",
          "MNFT",
          projectName,
          description,
          parseInt(quantity),
          salePriceInWei,
          brandIPNFTTokenId,
          artistIPNFTTokenIds,
          projectImageUri
        )
        .estimateGas({ from: walletInfo.address });

      console.log("가스 추정 결과:", gasEstimate.toString());

      // 트랜잭션 전송 전 call 테스트 시작...
      console.log("트랜잭션 전송 전 call 테스트 시작...");

      // 가스 한계를 늘려서 테스트
      const gasLimit = Math.floor(parseInt(gasEstimate) * 1.5); // 50% 여유분
      console.log("설정된 가스 한계:", gasLimit);

      const result = await merchandiseFactory.methods
        .createMerchandiseProject(
          "MerchandiseNFT",
          "MNFT",
          projectName,
          description,
          parseInt(quantity),
          salePriceInWei,
          brandIPNFTTokenId,
          artistIPNFTTokenIds,
          projectImageUri
        )
        .call({ from: walletInfo.address, gas: gasLimit });

      console.log("Call 테스트 성공:", result);

      // 실제 트랜잭션 전송
      const createProjectTxData = merchandiseFactory.methods
        .createMerchandiseProject(
          "MerchandiseNFT",
          "MNFT",
          projectName,
          description,
          parseInt(quantity),
          salePriceInWei,
          brandIPNFTTokenId,
          artistIPNFTTokenIds,
          projectImageUri
        )
        .encodeABI();

      const createProjectTx = {
        to: merchandiseFactoryAddress,
        value: "0",
        data: createProjectTxData,
        gas: gasLimit,
      };

      const signedCreateProjectTx = await blockchainService.signTransaction(
        secureChannel,
        fullWalletData,
        createProjectTx,
        accessToken
      );

      // 5. 트랜잭션 전송
      console.log("트랜잭션 전송 시작...");
      const createProjectReceipt = await web3.eth.sendSignedTransaction(
        signedCreateProjectTx
      );
      console.log("트랜잭션 전송 완료:", createProjectReceipt.transactionHash);

      return res.json({
        success: true,
        message: "Merchandise project created successfully",
        transactionHash: createProjectReceipt.transactionHash,
        merchandiseAddress: result, // Call 테스트에서 반환된 주소
        data: {
          projectName,
          description,
          quantity: parseInt(quantity),
          salePrice,
          brandIPNFTTokenId,
          artistIPNFTTokenIds,
        },
      });
    } catch (error) {
      console.log("Call 테스트 실패:", error);

      // 에러 상세 정보 로깅
      console.log("에러 상세 정보:", {
        message: error.message,
        code: error.code,
        data: error.data,
        receipt: error.receipt,
        cause: error.cause,
      });

      return res.status(400).json({
        success: false,
        message: "Failed to create merchandise project",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("상품 프로젝트 생성 오류:", error);
    logger.error("상품 프로젝트 생성 오류:", error);
    res.status(500).json({
      success: false,
      message: "상품 프로젝트 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 상품 프로젝트 목록 조회
const getProjects = async (req, res) => {
  try {
    console.log("MerchandiseFactory 주소:", merchandiseFactoryAddress);
    console.log("RPC URL:", process.env.RPC_URL);

    const merchandiseFactory = new web3.eth.Contract(
      require("../../abi/MerchandiseFactory.json"),
      merchandiseFactoryAddress
    );

    console.log("컨트랙트 인스턴스 생성 완료");

    const projectCount = await merchandiseFactory.methods
      .getProjectCount()
      .call();

    console.log("프로젝트 개수:", projectCount);

    const projects = [];

    for (let i = 0; i < projectCount; i++) {
      try {
        console.log(`프로젝트 ${i} 조회 시작`);
        const project = await merchandiseFactory.methods.getProject(i).call();
        console.log(`프로젝트 ${i} 데이터:`, project);

        const projectData = {
          projectId: i,
          name: project.name || "",
          description: project.description || "",
          imageUri: project.imageUri || "",
          quantity: project.quantity || "0",
          salePrice: web3.utils.fromWei(project.salePrice || "0", "ether"),
          creator: project.creator || "",
          isActive: project.isActive || false,
          soldCount: project.soldCount || "0",
          ipnftTokenIds: project.ipnftTokenIds || [],
        };

        console.log(`프로젝트 ${i} 처리된 데이터:`, projectData);
        projects.push(projectData);
      } catch (error) {
        console.error(`프로젝트 ${i} 조회 오류:`, error);
        logger.error(`프로젝트 ${i} 조회 오류:`, error);
      }
    }

    console.log("최종 프로젝트 목록:", projects);

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error("상품 프로젝트 목록 조회 오류 상세:", error);
    logger.error("상품 프로젝트 목록 조회 오류:", error);
    res.status(500).json({
      success: false,
      message: "상품 프로젝트 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 상품 구매
const purchaseMerchandise = async (req, res) => {
  try {
    const { projectId } = req.body;
    const buyerAddress = req.user.address;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "프로젝트 ID를 입력해주세요.",
      });
    }

    const merchandiseFactory = new web3.eth.Contract(
      require("../../abi/MerchandiseFactory.json"),
      merchandiseFactoryAddress
    );

    // 프로젝트 정보 조회
    const project = await merchandiseFactory.methods
      .getProject(projectId)
      .call();

    if (!project.isActive) {
      return res.status(400).json({
        success: false,
        message: "판매가 종료된 상품입니다.",
      });
    }

    if (parseInt(project.soldCount) >= parseInt(project.quantity)) {
      return res.status(400).json({
        success: false,
        message: "품절된 상품입니다.",
      });
    }

    // 구매 트랜잭션 생성
    const purchaseData = merchandiseFactory.methods
      .purchaseMerchandise(projectId)
      .encodeABI();

    res.json({
      success: true,
      message: "상품 구매 트랜잭션이 준비되었습니다.",
      data: {
        to: merchandiseFactoryAddress,
        data: purchaseData,
        value: project.salePrice,
      },
    });
  } catch (error) {
    logger.error("상품 구매 오류:", error);
    res.status(500).json({
      success: false,
      message: "상품 구매 중 오류가 발생했습니다.",
    });
  }
};

// 인플루언서 자신의 프로젝트 목록 조회
const getMyProjects = async (req, res) => {
  try {
    // accessToken에서 walletAddress 추출 (ipController 패턴 참고)
    const walletInfo = await walletService.getWallet(req.token);
    const walletAddress = walletInfo.address;

    if (!walletAddress) {
      return res.status(401).json({
        success: false,
        message: "No wallet address found from accessToken.",
      });
    }

    // 1. MerchandiseFactory 컨트랙트 연결
    const merchandiseFactoryAddress = process.env.MERCH_FACTORY_ADDRESS;
    const merchandiseFactory = new web3.eth.Contract(
      require("../../abi/MerchandiseFactory.json"),
      merchandiseFactoryAddress
    );

    // 2. 인플루언서의 프로젝트 목록 조회
    const influencerProjects = await merchandiseFactory.methods
      .getInfluencerProjects(walletAddress)
      .call();

    // 3. 각 프로젝트의 상세 정보 조회
    const projects = [];
    for (const projectAddress of influencerProjects) {
      try {
        const projectInfo = await merchandiseFactory.methods
          .getProjectInfo(projectAddress)
          .call();

        projects.push({
          merchandiseAddress: projectAddress,
          influencer: projectInfo._influencer,
          projectName: projectInfo._projectName,
          brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
          artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
          totalSupply: projectInfo._totalSupply,
          salePrice: projectInfo._salePrice,
          isActive: projectInfo._isActive,
          createdAt: projectInfo._createdAt,
        });
      } catch (error) {
        console.error(
          `Error fetching project info for ${projectAddress}:`,
          error
        );
        // 개별 프로젝트 조회 실패 시에도 계속 진행
      }
    }

    return res.json({
      success: true,
      message: "My merchandise projects retrieved successfully",
      data: stringifyBigInts(projects),
    });
  } catch (error) {
    console.error("My merchandise projects retrieval error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve my merchandise projects",
      error: error.message,
    });
  }
};

// 전체 프로젝트 목록 조회
const getAllProjects = async (req, res) => {
  try {
    // 1. MerchandiseFactory 컨트랙트 연결
    const merchandiseFactoryAddress = process.env.MERCH_FACTORY_ADDRESS;
    const merchandiseFactory = new web3.eth.Contract(
      require("../../abi/MerchandiseFactory.json"),
      merchandiseFactoryAddress
    );

    // 2. 전체 프로젝트 목록 조회
    const allProjects = await merchandiseFactory.methods
      .getAllMerchandiseNFTs()
      .call();

    // 3. 각 프로젝트의 상세 정보 조회
    const projects = [];
    for (const projectAddress of allProjects) {
      try {
        const projectInfo = await merchandiseFactory.methods
          .getProjectInfo(projectAddress)
          .call();

        projects.push({
          merchandiseAddress: projectAddress,
          influencer: projectInfo._influencer,
          projectName: projectInfo._projectName,
          brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
          artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
          totalSupply: projectInfo._totalSupply,
          salePrice: projectInfo._salePrice,
          isActive: projectInfo._isActive,
          createdAt: projectInfo._createdAt,
        });
      } catch (error) {
        console.error(
          `Error fetching project info for ${projectAddress}:`,
          error
        );
        // 개별 프로젝트 조회 실패 시에도 계속 진행
      }
    }

    return res.json({
      success: true,
      message: "All merchandise projects retrieved successfully",
      data: stringifyBigInts(projects),
    });
  } catch (error) {
    console.error("All merchandise projects retrieval error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve all merchandise projects",
      error: error.message,
    });
  }
};

module.exports = {
  createProject,
  getProjects,
  purchaseMerchandise,
  getMyProjects,
  getAllProjects,
};
