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

    // 3. IPNFT 유효성 및 타입 검증 (owner 검증 X)
    let brandIPNFTTokenId = null;
    let artistIPNFTTokenIds = [];

    // PlatformRegistry 컨트랙트 인스턴스 생성
    const platformRegistryContract = new web3.eth.Contract(
      require("../../abi/PlatformRegistry.json"),
      platformRegistryAddress
    );

    for (const tokenId of tokenIdsArray) {
      try {
        const numericTokenId = Number(tokenId);
        console.log(
          `[DEBUG] 검증 시도: tokenId=${tokenId}, numericTokenId=${numericTokenId}`
        );
        const isBrand = await platformRegistryContract.methods
          .validateBrandIPNFT(numericTokenId)
          .call();
        const isArtist = await platformRegistryContract.methods
          .validateArtistIPNFT(numericTokenId)
          .call();
        console.log(
          `[DEBUG] 검증 결과: isBrand=${isBrand}, isArtist=${isArtist}`
        );

        if (!isBrand && !isArtist) {
          return res.status(400).json({
            success: false,
            message: `IPNFT 토큰 ID ${tokenId}는 유효한 brand/artist IPNFT가 아닙니다.`,
          });
        }

        if (isBrand) {
          if (brandIPNFTTokenId !== null) {
            return res.status(400).json({
              success: false,
              message: "brand IPNFT는 하나만 지정할 수 있습니다.",
            });
          }
          brandIPNFTTokenId = numericTokenId;
        } else if (isArtist) {
          artistIPNFTTokenIds.push(numericTokenId);
        }
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: `IPNFT 토큰 ID ${tokenId} 검증 중 오류 발생`,
          error: err.message,
        });
      }
    }

    if (brandIPNFTTokenId === null) {
      return res.status(400).json({
        success: false,
        message: "brand IPNFT를 반드시 하나 지정해야 합니다.",
      });
    }
    if (artistIPNFTTokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "artist IPNFT를 하나 이상 지정해야 합니다.",
      });
    }

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

    // 4. Merchandise 프로젝트 생성
    console.log("Merchandise 프로젝트 생성 시작...");

    // 숫자 타입 변환
    const totalSupply = parseInt(quantity);
    const salePriceInWei = web3.utils.toWei(salePrice.toString(), "ether");

    console.log("생성 파라미터:", {
      projectName,
      description,
      totalSupply,
      salePriceInWei,
      brandIPNFTTokenId,
      artistIPNFTTokenIds,
      projectImageUri,
    });

    const createProjectTx =
      merchandiseFactoryContract.methods.createMerchandiseProject(
        projectName,
        description,
        totalSupply,
        salePriceInWei,
        brandIPNFTTokenId || 0, // brand IPNFT가 없으면 0
        artistIPNFTTokenIds,
        projectImageUri
      );

    const gasEstimate = await createProjectTx.estimateGas({
      from: walletInfo.address,
    });

    console.log("가스 추정:", gasEstimate);

    // ABC WAAS를 통해 트랜잭션 전송
    const transactionData = {
      to: merchandiseFactoryAddress,
      data: createProjectTx.encodeABI(),
      value: "0",
    };

    // 1. 트랜잭션 서명
    const signedTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      transactionData,
      req.token
    );

    // 2. 서명된 트랜잭션 전송
    const transactionHash = await blockchainService.sendTransaction(signedTx);

    console.log("프로젝트 생성 완료, 트랜잭션 해시:", transactionHash);

    // 3. 트랜잭션 영수증 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await blockchainService.getTransactionReceipt(
      transactionHash
    );

    // 4. 생성된 프로젝트 ID 추출 (이벤트에서)
    console.log("트랜잭션 영수증 로그:", receipt.logs);

    // 모든 로그의 topics 확인
    receipt.logs.forEach((log, index) => {
      console.log(`로그 ${index}:`, {
        address: log.address,
        topics: log.topics,
        data: log.data,
      });
    });

    // MerchandiseProjectCreated 이벤트 찾기
    const expectedEventSignature =
      "0x2ed1fd105197255d60a3ac92a9c91aebb18620efc66764103d6f04d28ee057d5";
    console.log("예상 이벤트 시그니처:", expectedEventSignature);

    const projectCreatedEvent = receipt.logs.find(
      (log) => log.topics[0] === expectedEventSignature
    );

    if (!projectCreatedEvent) {
      console.log("이벤트를 찾을 수 없습니다. 모든 로그의 첫 번째 topic:");
      receipt.logs.forEach((log, index) => {
        console.log(`로그 ${index} 첫 번째 topic:`, log.topics[0]);
      });

      // 첫 번째 로그를 사용 (일반적으로 프로젝트 생성 이벤트)
      if (receipt.logs.length > 0) {
        console.log("첫 번째 로그를 사용합니다.");
        const firstLog = receipt.logs[0];

        // projectId는 topics[1]에서 직접 추출
        const projectId = parseInt(firstLog.topics[1], 16);
        console.log("생성된 프로젝트 ID:", projectId);

        // 6. 생성된 프로젝트 정보 조회
        console.log("프로젝트 정보 조회 시작...");
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call();
        console.log("프로젝트 정보 조회 완료:", projectInfo);

        console.log("응답 데이터 준비 시작...");
        const responseData = {
          success: true,
          message: "상품 프로젝트가 성공적으로 생성되었습니다.",
          data: {
            projectId: projectId,
            projectName: projectInfo._projectName,
            description: projectInfo._productDescription,
            totalSupply: projectInfo._totalSupply,
            salePrice: web3.utils.fromWei(projectInfo._salePrice, "ether"),
            brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
            artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
            isActive: projectInfo._isActive,
            createdAt: projectInfo._createdAt,
            projectImageURI: projectInfo._projectImageURI,
            mintedCount: projectInfo._mintedCount,
            transactionHash: transactionHash,
          },
        };
        console.log("응답 데이터 준비 완료:", responseData);

        console.log("응답 전송 시작...");
        res.json(stringifyBigInts(responseData));
        console.log("응답 전송 완료");
        return;
      }

      throw new Error("프로젝트 생성 이벤트를 찾을 수 없습니다.");
    }

    // projectId는 topics[1]에서 직접 추출
    const projectId = parseInt(projectCreatedEvent.topics[1], 16);
    console.log("생성된 프로젝트 ID:", projectId);

    // 6. 생성된 프로젝트 정보 조회
    console.log("프로젝트 정보 조회 시작...");
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();
    console.log("프로젝트 정보 조회 완료:", projectInfo);

    console.log("응답 데이터 준비 시작...");
    const responseData = {
      success: true,
      message: "상품 프로젝트가 성공적으로 생성되었습니다.",
      data: {
        projectId: projectId,
        projectName: projectInfo._projectName,
        description: projectInfo._productDescription,
        totalSupply: projectInfo._totalSupply,
        salePrice: web3.utils.fromWei(projectInfo._salePrice, "ether"),
        brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
        artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
        isActive: projectInfo._isActive,
        createdAt: projectInfo._createdAt,
        projectImageURI: projectInfo._projectImageURI,
        mintedCount: projectInfo._mintedCount,
        transactionHash: transactionHash,
      },
    };
    console.log("응답 데이터 준비 완료:", responseData);

    console.log("응답 전송 시작...");
    res.json(stringifyBigInts(responseData));
    console.log("응답 전송 완료");
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
          salePrice: web3.utils.fromWei(projectInfo._salePrice || "0", "ether"),
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

    // 2. 전체 프로젝트 수 조회
    const projectCount = await merchandiseFactory.methods
      .getProjectCount()
      .call();

    console.log("전체 프로젝트 수:", projectCount);

    // 3. 각 프로젝트의 상세 정보 조회
    const projects = [];
    for (let projectId = 0; projectId < projectCount; projectId++) {
      try {
        console.log(`프로젝트 ${projectId} 조회 시작`);
        const projectInfo = await merchandiseFactory.methods
          .getProjectInfo(projectId)
          .call();

        console.log(`프로젝트 ${projectId} 정보:`, projectInfo);

        projects.push({
          projectId: projectId,
          influencer: projectInfo._influencer,
          projectName: projectInfo._projectName,
          description: projectInfo._productDescription,
          brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
          artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
          totalSupply: projectInfo._totalSupply,
          salePrice: web3.utils.fromWei(projectInfo._salePrice || "0", "ether"),
          isActive: projectInfo._isActive,
          createdAt: projectInfo._createdAt,
          projectImageURI: projectInfo._projectImageURI,
          mintedCount: projectInfo._mintedCount,
        });
      } catch (error) {
        console.error(
          `Error fetching project info for projectId ${projectId}:`,
          error
        );
        // 개별 프로젝트 조회 실패 시에도 계속 진행
      }
    }

    console.log("전체 프로젝트 목록 조회 완료:", projects);

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

// 구매 요청 (사용자가 DP로 구매 신청)
const requestPurchase = async (req, res) => {
  const accessToken = req.token;
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID를 입력해주세요.",
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

    // 2. 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "프로젝트를 찾을 수 없습니다.",
      });
    }

    if (!projectInfo._isActive) {
      return res.status(400).json({
        success: false,
        message: "해당 프로젝트는 현재 비활성화 상태입니다.",
      });
    }

    // 3. 재고 확인
    if (projectInfo._mintedCount >= projectInfo._totalSupply) {
      return res.status(400).json({
        success: false,
        message: "해당 프로젝트의 재고가 모두 소진되었습니다.",
      });
    }

    // 4. DP 토큰 잔액 확인
    const dpTokenAddress = process.env.DP_TOKEN_ADDRESS;
    const dpTokenContract = new web3.eth.Contract(
      require("../../abi/DPToken.json"),
      dpTokenAddress
    );

    const balance = await dpTokenContract.methods
      .balanceOf(walletInfo.address)
      .call();

    // BigInt 비교를 위해 문자열로 변환
    const balanceStr = balance.toString();
    const salePriceStr = projectInfo._salePrice.toString();

    if (BigInt(balanceStr) < BigInt(salePriceStr)) {
      return res.status(400).json({
        success: false,
        message: `DP 토큰 잔액이 부족합니다. 현재 잔액: ${web3.utils.fromWei(
          balanceStr,
          "ether"
        )} DP, 필요 금액: ${web3.utils.fromWei(salePriceStr, "ether")} DP`,
      });
    }

    // 5. 중복 구매 요청 방지
    const totalRequests = await merchandiseFactoryContract.methods
      .projectTotalRequests(projectId)
      .call();

    // 기존 구매 요청들 확인
    for (let i = 0; i < totalRequests; i++) {
      const existingRequest = await merchandiseFactoryContract.methods
        .getPurchaseRequest(projectId, i)
        .call();

      if (
        existingRequest.buyer.toLowerCase() ===
          walletInfo.address.toLowerCase() &&
        !existingRequest.isConfirmed &&
        !existingRequest.isCancelled
      ) {
        return res.status(400).json({
          success: false,
          message:
            "이미 진행 중인 구매 요청이 있습니다. 기존 요청을 취소하거나 확정을 기다려주세요.",
        });
      }
    }

    // 6. DP 토큰 승인 확인 및 승인
    const approveData = dpTokenContract.methods
      .approve(merchandiseFactoryAddress, projectInfo._salePrice)
      .encodeABI();

    const approveTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      {
        to: dpTokenAddress,
        data: approveData,
        value: "0",
      },
      accessToken
    );

    const approveHash = await blockchainService.sendTransaction(approveTx);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await blockchainService.getTransactionReceipt(approveHash);

    // 7. 구매 요청 실행
    console.log("[requestPurchase] 구매 요청 실행 시작...");

    // ABC WAAS를 통해 트랜잭션 전송
    const transactionData = {
      to: merchandiseFactoryAddress,
      data: merchandiseFactoryContract.methods
        .requestPurchase(projectId)
        .encodeABI(),
      value: "0",
    };

    // 1. 트랜잭션 서명
    const signedTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      transactionData,
      accessToken
    );

    // 2. 서명된 트랜잭션 전송
    const transactionHash = await blockchainService.sendTransaction(signedTx);

    console.log("[requestPurchase] 트랜잭션 완료, 해시:", transactionHash);

    // 3. 트랜잭션 영수증 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await blockchainService.getTransactionReceipt(
      transactionHash
    );

    console.log("[requestPurchase] 트랜잭션 영수증:", receipt);

    // 4. 구매 요청 ID 추출 (이벤트에서)
    const expectedEventSignature = web3.utils.keccak256(
      "PurchaseRequestCreated(uint256,uint256,address,uint256)"
    );
    console.log(
      "[requestPurchase] 예상 이벤트 시그니처:",
      expectedEventSignature
    );

    const purchaseRequestCreatedEvent = receipt.logs.find(
      (log) => log.topics[0] === expectedEventSignature
    );

    if (!purchaseRequestCreatedEvent) {
      console.log(
        "[requestPurchase] 이벤트를 찾을 수 없습니다. 모든 로그의 첫 번째 topic:"
      );
      receipt.logs.forEach((log, index) => {
        console.log(`로그 ${index} 첫 번째 topic:`, log.topics[0]);
      });
      throw new Error("구매 요청 이벤트를 찾을 수 없습니다.");
    }

    // requestId는 topics[1]에서 직접 추출
    const requestId = parseInt(purchaseRequestCreatedEvent.topics[1], 16);
    console.log("[requestPurchase] 생성된 구매 요청 ID:", requestId);

    logger.info("구매 요청 완료", {
      userAddress: walletInfo.address,
      projectId: projectId,
      requestId: requestId,
      amount: projectInfo._salePrice,
      txHash: transactionHash,
    });

    res.json({
      success: true,
      message: "구매 요청이 성공적으로 처리되었습니다.",
      data: {
        requestId: requestId,
        projectId: projectId,
        buyer: walletInfo.address,
        amount: web3.utils.fromWei(projectInfo._salePrice || "0", "ether"),
        amountWei: projectInfo._salePrice.toString(),
        txHash: transactionHash,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
        projectName: projectInfo._projectName,
        projectImageURI: projectInfo._projectImageURI,
      },
    });
  } catch (error) {
    logger.error("구매 요청 실패", error);
    res.status(500).json({
      success: false,
      message: "구매 요청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 구매 확정 (인플루언서가 확정)
const confirmPurchase = async (req, res) => {
  const accessToken = req.token;
  const { projectId, requestId } = req.body;

  if (!projectId || requestId === undefined) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID와 요청 ID를 입력해주세요.",
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

    // 2. 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "프로젝트를 찾을 수 없습니다.",
      });
    }

    // 3. 구매 요청 정보 확인
    const purchaseRequest = await merchandiseFactoryContract.methods
      .getPurchaseRequest(projectId, requestId)
      .call();

    if (
      !purchaseRequest.buyer ||
      purchaseRequest.buyer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "구매 요청을 찾을 수 없습니다.",
      });
    }

    // 구매자 권한 확인 (구매자만 확정 가능)
    if (
      purchaseRequest.buyer.toLowerCase() !== walletInfo.address.toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message: "구매자만 구매를 확정할 수 있습니다.",
      });
    }

    if (purchaseRequest.isConfirmed) {
      return res.status(400).json({
        success: false,
        message: "이미 확정된 구매 요청입니다.",
      });
    }

    if (purchaseRequest.isCancelled) {
      return res.status(400).json({
        success: false,
        message: "이미 취소된 구매 요청입니다.",
      });
    }

    // 4. 재고 확인
    if (projectInfo._mintedCount >= projectInfo._totalSupply) {
      return res.status(400).json({
        success: false,
        message: "해당 프로젝트의 재고가 모두 소진되었습니다.",
      });
    }

    // 5. 구매 확정 실행
    console.log("[confirmPurchase] 구매 확정 실행 시작...");

    // ABC WAAS를 통해 트랜잭션 전송
    const transactionData = {
      to: merchandiseFactoryAddress,
      data: merchandiseFactoryContract.methods
        .confirmPurchase(projectId, requestId)
        .encodeABI(),
      value: "0",
    };

    // 1. 트랜잭션 서명
    const signedTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      transactionData,
      accessToken
    );

    // 2. 서명된 트랜잭션 전송
    const transactionHash = await blockchainService.sendTransaction(signedTx);

    console.log("[confirmPurchase] 트랜잭션 완료, 해시:", transactionHash);

    // 3. 트랜잭션 영수증 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await blockchainService.getTransactionReceipt(
      transactionHash
    );

    console.log("[confirmPurchase] 트랜잭션 영수증:", receipt);

    // 4. 확정된 구매 정보 추출 (이벤트에서)
    const expectedEventSignature = web3.utils.keccak256(
      "PurchaseConfirmed(uint256,uint256,address,uint256,uint256)"
    );
    console.log(
      "[confirmPurchase] 예상 이벤트 시그니처:",
      expectedEventSignature
    );

    const purchaseConfirmedEvent = receipt.logs.find(
      (log) => log.topics[0] === expectedEventSignature
    );

    if (!purchaseConfirmedEvent) {
      console.log(
        "[confirmPurchase] 이벤트를 찾을 수 없습니다. 모든 로그의 첫 번째 topic:"
      );
      receipt.logs.forEach((log, index) => {
        console.log(`로그 ${index} 첫 번째 topic:`, log.topics[0]);
      });
      throw new Error("구매 확정 이벤트를 찾을 수 없습니다.");
    }

    // 이벤트 데이터에서 정보 추출 (indexed 파라미터는 topics에서, 나머지는 data에서)
    const decodedData = web3.eth.abi.decodeLog(
      [
        {
          type: "uint256",
          name: "projectId",
          indexed: true,
        },
        {
          type: "uint256",
          name: "requestId",
          indexed: false,
        },
        {
          type: "address",
          name: "buyer",
          indexed: false,
        },
        {
          type: "uint256",
          name: "tokenId",
          indexed: false,
        },
        {
          type: "uint256",
          name: "amount",
          indexed: false,
        },
      ],
      purchaseConfirmedEvent.data,
      [purchaseConfirmedEvent.topics[1]]
    );

    const confirmedTokenId = decodedData.tokenId;
    const buyer = decodedData.buyer;
    const amount = decodedData.amount;

    console.log("[confirmPurchase] 생성된 토큰 ID:", confirmedTokenId);
    console.log("[confirmPurchase] 구매자:", buyer);
    console.log("[confirmPurchase] 금액:", amount);

    logger.info("구매 확정 완료", {
      influencerAddress: walletInfo.address,
      projectId: projectId,
      requestId: requestId,
      buyer: buyer,
      tokenId: confirmedTokenId.toString(),
      amount: amount.toString(),
      txHash: transactionHash,
    });

    res.json({
      success: true,
      message: "구매가 성공적으로 확정되었습니다.",
      data: {
        projectId: projectId,
        requestId: requestId,
        buyer: buyer,
        tokenId: confirmedTokenId.toString(),
        amount: web3.utils.fromWei(amount.toString() || "0", "ether"),
        txHash: transactionHash,
      },
    });
  } catch (error) {
    logger.error("구매 확정 실패", error);
    res.status(500).json({
      success: false,
      message: "구매 확정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 구매 취소 (구매자 또는 인플루언서가 취소)
const cancelPurchase = async (req, res) => {
  const accessToken = req.token;
  const { projectId, requestId } = req.body;

  if (!projectId || requestId === undefined) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID와 요청 ID를 입력해주세요.",
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

    // 2. 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "프로젝트를 찾을 수 없습니다.",
      });
    }

    // 3. 구매 요청 정보 확인
    const purchaseRequest = await merchandiseFactoryContract.methods
      .getPurchaseRequest(projectId, requestId)
      .call();

    if (
      !purchaseRequest.buyer ||
      purchaseRequest.buyer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "구매 요청을 찾을 수 없습니다.",
      });
    }

    if (purchaseRequest.isConfirmed) {
      return res.status(400).json({
        success: false,
        message: "이미 확정된 구매 요청은 취소할 수 없습니다.",
      });
    }

    if (purchaseRequest.isCancelled) {
      return res.status(400).json({
        success: false,
        message: "이미 취소된 구매 요청입니다.",
      });
    }

    // 구매자 권한 확인 (구매자만 취소 가능)
    if (
      purchaseRequest.buyer.toLowerCase() !== walletInfo.address.toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message: "구매자만 구매를 취소할 수 있습니다.",
      });
    }

    // 5. 구매 취소 실행
    console.log("[cancelPurchase] 구매 취소 실행 시작...");

    // ABC WAAS를 통해 트랜잭션 전송
    const transactionData = {
      to: merchandiseFactoryAddress,
      data: merchandiseFactoryContract.methods
        .cancelPurchase(projectId, requestId)
        .encodeABI(),
      value: "0",
    };

    // 1. 트랜잭션 서명
    const signedTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      transactionData,
      accessToken
    );

    // 2. 서명된 트랜잭션 전송
    const transactionHash = await blockchainService.sendTransaction(signedTx);

    console.log("[cancelPurchase] 트랜잭션 완료, 해시:", transactionHash);

    // 3. 트랜잭션 영수증 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await blockchainService.getTransactionReceipt(
      transactionHash
    );

    console.log("[cancelPurchase] 트랜잭션 영수증:", receipt);

    // 4. 취소 정보 추출 (이벤트에서)
    const expectedEventSignature = web3.utils.keccak256(
      "PurchaseCancelled(uint256,uint256,address,uint256,uint256)"
    );
    console.log(
      "[cancelPurchase] 예상 이벤트 시그니처:",
      expectedEventSignature
    );

    const purchaseCancelledEvent = receipt.logs.find(
      (log) => log.topics[0] === expectedEventSignature
    );

    if (!purchaseCancelledEvent) {
      console.log(
        "[cancelPurchase] 이벤트를 찾을 수 없습니다. 모든 로그의 첫 번째 topic:"
      );
      receipt.logs.forEach((log, index) => {
        console.log(`로그 ${index} 첫 번째 topic:`, log.topics[0]);
      });
      throw new Error("구매 취소 이벤트를 찾을 수 없습니다.");
    }

    // 이벤트 데이터에서 refundAmount와 platformFee 추출
    const decodedData = web3.eth.abi.decodeParameters(
      ["uint256", "uint256"],
      purchaseCancelledEvent.data
    );

    const refundAmount = decodedData[0];
    const platformFee = decodedData[1];

    console.log("[cancelPurchase] 환불 금액:", refundAmount);
    console.log("[cancelPurchase] 플랫폼 수수료:", platformFee);

    logger.info("구매 취소 완료", {
      userAddress: walletInfo.address,
      projectId: projectId,
      requestId: requestId,
      buyer: purchaseRequest.buyer,
      refundAmount: refundAmount.toString(),
      platformFee: platformFee.toString(),
      txHash: transactionHash,
    });

    res.json({
      success: true,
      message: "구매가 성공적으로 취소되었습니다.",
      data: {
        projectId: projectId,
        requestId: requestId,
        buyer: purchaseRequest.buyer,
        refundAmount: web3.utils.fromWei(
          refundAmount.toString() || "0",
          "ether"
        ),
        platformFee: web3.utils.fromWei(platformFee.toString() || "0", "ether"),
        txHash: transactionHash,
      },
    });
  } catch (error) {
    logger.error("구매 취소 실패", error);
    res.status(500).json({
      success: false,
      message: "구매 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 구매 요청 정보 조회
const getPurchaseRequest = async (req, res) => {
  const { projectId, requestId } = req.params;

  if (!projectId || requestId === undefined) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID와 요청 ID가 필요합니다.",
    });
  }

  try {
    const purchaseRequest = await merchandiseFactoryContract.methods
      .getPurchaseRequest(projectId, requestId)
      .call();

    if (
      !purchaseRequest.buyer ||
      purchaseRequest.buyer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "구매 요청을 찾을 수 없습니다.",
      });
    }

    res.json({
      success: true,
      data: {
        projectId: projectId,
        requestId: requestId,
        buyer: purchaseRequest.buyer,
        amount: web3.utils.fromWei(purchaseRequest.amount || "0", "ether"),
        timestamp: purchaseRequest.timestamp.toString(),
        isConfirmed: purchaseRequest.isConfirmed,
        isCancelled: purchaseRequest.isCancelled,
        tokenId: purchaseRequest.tokenId.toString(),
      },
    });
  } catch (error) {
    logger.error("구매 요청 정보 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "구매 요청 정보 조회 중 오류가 발생했습니다.",
      message: errorMessage,
      error: error.message,
    });
  }
};

// 프로젝트별 구매 요청 목록 조회
const getProjectPurchaseRequests = async (req, res) => {
  const { projectId } = req.params;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID를 입력해주세요.",
    });
  }

  try {
    // 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "프로젝트를 찾을 수 없습니다.",
      });
    }

    // 해당 프로젝트의 구매 요청 수 조회
    const totalRequests = await merchandiseFactoryContract.methods
      .projectTotalRequests(projectId)
      .call();

    const purchaseRequests = [];
    for (let requestId = 0; requestId < totalRequests; requestId++) {
      try {
        const purchaseRequest = await merchandiseFactoryContract.methods
          .getPurchaseRequest(projectId, requestId)
          .call();

        if (
          purchaseRequest.buyer &&
          purchaseRequest.buyer !== "0x0000000000000000000000000000000000000000"
        ) {
          purchaseRequests.push({
            requestId: requestId,
            buyer: purchaseRequest.buyer,
            amount: web3.utils.fromWei(purchaseRequest.amount || "0", "ether"),
            amountWei: purchaseRequest.amount.toString(),
            timestamp: purchaseRequest.timestamp.toString(),
            isConfirmed: purchaseRequest.isConfirmed,
            isCancelled: purchaseRequest.isCancelled,
            status: purchaseRequest.isConfirmed
              ? "confirmed"
              : purchaseRequest.isCancelled
              ? "cancelled"
              : "pending",
            tokenId: purchaseRequest.tokenId.toString(),
          });
        }
      } catch (error) {
        console.error(`요청 ID ${requestId} 조회 실패:`, error);
      }
    }

    res.json({
      success: true,
      data: {
        projectId: projectId,
        projectName: projectInfo._projectName,
        projectImageURI: projectInfo._projectImageURI,
        purchaseRequests: purchaseRequests,
        totalCount: purchaseRequests.length,
      },
    });
  } catch (error) {
    logger.error("프로젝트 구매 요청 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "프로젝트 구매 요청 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 프로젝트 활성화 (브랜드 IPNFT 소유자만)
const setActive = async (req, res) => {
  const accessToken = req.token;
  const { projectId } = req.params;

  console.log("[setActive] 프로젝트 활성화 시작 - projectId:", projectId);

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: "프로젝트 ID가 필요합니다.",
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

    console.log("[setActive] 사용자 주소:", walletInfo.address);

    // 2. 프로젝트 정보 조회
    const projectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    console.log("[setActive] 프로젝트 정보:", projectInfo);

    if (
      !projectInfo._influencer ||
      projectInfo._influencer === "0x0000000000000000000000000000000000000000"
    ) {
      return res.status(404).json({
        success: false,
        message: "프로젝트를 찾을 수 없습니다.",
      });
    }

    // 3. 브랜드 IPNFT 토큰 ID 확인
    const brandIPNFTTokenId = projectInfo._brandIPNFTTokenId;
    if (brandIPNFTTokenId == 0) {
      return res.status(400).json({
        success: false,
        message: "이 프로젝트는 브랜드 IPNFT가 없습니다.",
      });
    }

    console.log(
      "[setActive] 브랜드 IPNFT 토큰 ID:",
      brandIPNFTTokenId.toString()
    );

    // 4. IPNFT 컨트랙트에서 브랜드 소유자 확인
    const platformRegistry = new web3.eth.Contract(
      require("../../abi/PlatformRegistry.json"),
      platformRegistryAddress
    );
    const ipnftFactoryAddr = await platformRegistry.methods
      .ipnftFactory()
      .call();
    const ipnftFactory = new web3.eth.Contract(
      require("../../abi/IPNFTFactory.json"),
      ipnftFactoryAddr
    );
    const ipnftContractAddress = await ipnftFactory.methods
      .getIPNFTAddress()
      .call();

    const ipnftContract = new web3.eth.Contract(
      require("../../abi/IPNFT.json"),
      ipnftContractAddress
    );

    const brandOwner = await ipnftContract.methods
      .ownerOf(brandIPNFTTokenId)
      .call();
    console.log("[setActive] 브랜드 소유자:", brandOwner);
    console.log("[setActive] 요청자:", walletInfo.address);

    // 5. 권한 검증 (브랜드 IPNFT 소유자인지 확인)
    if (brandOwner.toLowerCase() !== walletInfo.address.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "해당 프로젝트의 브랜드(IPNFT) 소유자만 활성화할 수 있습니다.",
      });
    }

    // 6. Factory의 setProjectActive 호출
    console.log("[setActive] Factory setProjectActive 호출 시작...");

    // ABC WAAS를 통해 트랜잭션 전송
    const transactionData = {
      to: merchandiseFactoryAddress,
      data: merchandiseFactoryContract.methods
        .setProjectActive(projectId, true)
        .encodeABI(),
      value: "0",
    };

    // 1. 트랜잭션 서명
    const signedTx = await blockchainService.signTransaction(
      secureChannel,
      fullWalletData,
      transactionData,
      req.token
    );

    // 2. 서명된 트랜잭션 전송
    const transactionHash = await blockchainService.sendTransaction(signedTx);

    console.log("[setActive] 트랜잭션 완료, 해시:", transactionHash);

    // 3. 트랜잭션 영수증 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await blockchainService.getTransactionReceipt(
      transactionHash
    );

    console.log("[setActive] 트랜잭션 영수증:", receipt);

    // 7. 업데이트된 프로젝트 정보 조회
    const updatedProjectInfo = await merchandiseFactoryContract.methods
      .getProjectInfo(projectId)
      .call();

    console.log("[setActive] 업데이트된 프로젝트 정보:", updatedProjectInfo);

    res.json({
      success: true,
      message: "프로젝트가 성공적으로 활성화되었습니다.",
      data: {
        projectId: projectId,
        isActive: updatedProjectInfo._isActive,
        transactionHash: transactionHash,
      },
    });
  } catch (error) {
    console.error("[setActive] 오류:", error);

    // 에러 메시지 분석
    let errorMessage = "프로젝트 활성화 중 오류가 발생했습니다.";
    if (error.message.includes("Only brand IPNFT owner can set status")) {
      errorMessage = "브랜드 IPNFT 소유자만 프로젝트를 활성화할 수 있습니다.";
    } else if (error.message.includes("Project does not exist")) {
      errorMessage = "프로젝트를 찾을 수 없습니다.";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};

// 브랜드가 서명(활성화)해야 하는 프로젝트만 조회
const getBrandPendingProjects = async (req, res) => {
  try {
    const walletInfo = await walletService.getWallet(req.token);
    const myAddress = walletInfo.address.toLowerCase();

    // 1. 전체 프로젝트 수 조회
    const projectCount = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    const result = [];

    // 2. 모든 프로젝트를 순회하며 브랜드 소유자의 비활성화된 프로젝트 찾기
    for (let i = 0; i < projectCount; i++) {
      try {
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(i)
          .call();

        // 프로젝트가 존재하고 비활성화 상태인지 확인
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          continue; // 프로젝트가 존재하지 않음
        }

        if (projectInfo._isActive) {
          continue; // 이미 활성화된 프로젝트
        }

        // 브랜드 IPNFT 토큰 ID 확인
        const brandIPNFTTokenId = projectInfo._brandIPNFTTokenId;
        if (brandIPNFTTokenId == 0) {
          continue; // 브랜드 IPNFT가 없는 프로젝트
        }

        // IPNFT 컨트랙트에서 브랜드 소유자 확인
        const platformRegistry = new web3.eth.Contract(
          require("../../abi/PlatformRegistry.json"),
          platformRegistryAddress
        );
        const ipnftFactoryAddr = await platformRegistry.methods
          .ipnftFactory()
          .call();
        const ipnftFactory = new web3.eth.Contract(
          require("../../abi/IPNFTFactory.json"),
          ipnftFactoryAddr
        );
        const ipnftContractAddress = await ipnftFactory.methods
          .getIPNFTAddress()
          .call();

        const ipnftContract = new web3.eth.Contract(
          require("../../abi/IPNFT.json"),
          ipnftContractAddress
        );

        const brandOwner = await ipnftContract.methods
          .ownerOf(brandIPNFTTokenId)
          .call();

        if (brandOwner.toLowerCase() === myAddress) {
          result.push({
            projectId: i,
            influencer: projectInfo._influencer,
            projectName: projectInfo._projectName,
            productDescription: projectInfo._productDescription,
            brandIPNFTTokenId: projectInfo._brandIPNFTTokenId,
            artistIPNFTTokenIds: projectInfo._artistIPNFTTokenIds,
            totalSupply: projectInfo._totalSupply,
            salePrice: web3.utils.fromWei(
              projectInfo._salePrice || "0",
              "ether"
            ),
            isActive: projectInfo._isActive,
            createdAt: projectInfo._createdAt,
            projectImageURI: projectInfo._projectImageURI,
            mintedCount: projectInfo._mintedCount,
          });
        }
      } catch (e) {
        console.error(`프로젝트 ${i} 조회 실패:`, e);
        // 개별 프로젝트 오류 무시하고 계속 진행
      }
    }

    return res.json({
      success: true,
      data: stringifyBigInts(result),
      totalCount: result.length,
    });
  } catch (error) {
    console.error("브랜드 서명 대기 프로젝트 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "브랜드 서명 대기 프로젝트 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 구매자별 구매 요청 조회
const getMyPurchaseRequests = async (req, res) => {
  const accessToken = req.token;

  try {
    // 1. 사용자 정보 조회
    const walletInfo = await walletService.getWallet(accessToken);
    const buyerAddress = walletInfo.address.toLowerCase();

    console.log("[getMyPurchaseRequests] 구매자 주소:", buyerAddress);

    // 2. 전체 프로젝트 수 조회
    const projectCount = await merchandiseFactoryContract.methods
      .getProjectCount()
      .call();

    console.log("[getMyPurchaseRequests] 전체 프로젝트 수:", projectCount);

    const myPurchaseRequests = [];

    // 3. 모든 프로젝트의 구매 요청들을 확인
    for (let projectId = 0; projectId < projectCount; projectId++) {
      try {
        // 프로젝트 정보 조회
        const projectInfo = await merchandiseFactoryContract.methods
          .getProjectInfo(projectId)
          .call();

        // 프로젝트가 존재하지 않으면 건너뛰기
        if (
          !projectInfo._influencer ||
          projectInfo._influencer ===
            "0x0000000000000000000000000000000000000000"
        ) {
          continue;
        }

        // 해당 프로젝트의 구매 요청 수 조회
        const totalRequests = await merchandiseFactoryContract.methods
          .projectTotalRequests(projectId)
          .call();

        console.log(
          `[getMyPurchaseRequests] 프로젝트 ${projectId}의 구매 요청 수:`,
          totalRequests
        );

        // 각 구매 요청 확인
        for (let requestId = 0; requestId < totalRequests; requestId++) {
          try {
            const purchaseRequest = await merchandiseFactoryContract.methods
              .getPurchaseRequest(projectId, requestId)
              .call();

            // 구매자가 일치하는지 확인
            if (
              purchaseRequest.buyer &&
              purchaseRequest.buyer.toLowerCase() === buyerAddress
            ) {
              myPurchaseRequests.push({
                projectId: projectId,
                requestId: requestId,
                buyer: purchaseRequest.buyer,
                amount: web3.utils.fromWei(
                  purchaseRequest.amount || "0",
                  "ether"
                ),
                amountWei: purchaseRequest.amount.toString(),
                timestamp: purchaseRequest.timestamp.toString(),
                isConfirmed: purchaseRequest.isConfirmed,
                isCancelled: purchaseRequest.isCancelled,
                status: purchaseRequest.isConfirmed
                  ? "confirmed"
                  : purchaseRequest.isCancelled
                  ? "cancelled"
                  : "pending",
                projectName: projectInfo._projectName,
                projectImageURI: projectInfo._projectImageURI,
                projectDescription: projectInfo._productDescription,
              });
            }
          } catch (err) {
            console.error(
              `[getMyPurchaseRequests] 구매 요청 ${requestId} 조회 실패:`,
              err
            );
            // 개별 구매 요청 오류는 무시하고 계속 진행
          }
        }
      } catch (err) {
        console.error(
          `[getMyPurchaseRequests] 프로젝트 ${projectId} 조회 실패:`,
          err
        );
        // 개별 프로젝트 오류는 무시하고 계속 진행
      }
    }

    // 4. 최신 순으로 정렬 (BigInt 비교 사용)
    myPurchaseRequests.sort((a, b) => {
      const timestampA = BigInt(a.timestamp);
      const timestampB = BigInt(b.timestamp);
      return timestampB > timestampA ? 1 : timestampB < timestampA ? -1 : 0;
    });

    console.log(
      "[getMyPurchaseRequests] 조회된 구매 요청 수:",
      myPurchaseRequests.length
    );

    res.json({
      success: true,
      message: "구매 요청 목록을 성공적으로 조회했습니다.",
      data: stringifyBigInts({
        purchaseRequests: myPurchaseRequests,
        totalCount: myPurchaseRequests.length,
      }),
    });
  } catch (error) {
    console.error("[getMyPurchaseRequests] 오류:", error);
    res.status(500).json({
      success: false,
      message: "구매 요청 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

// 수수료 수취 주소 조회
const getPlatformFeeInfo = async (req, res) => {
  try {
    // 1. 수수료 수취 주소 조회
    const platformFeeCollector = await merchandiseFactoryContract.methods
      .platformFeeCollector()
      .call();

    // 2. 수수료 비율 조회
    const platformFeePercentage = await merchandiseFactoryContract.methods
      .platformFeePercentage()
      .call();

    // 3. 수수료 비율을 퍼센트로 변환 (basis points -> percentage)
    const feePercentage = Number(platformFeePercentage) / 100;

    res.json({
      success: true,
      message: "플랫폼 수수료 정보를 성공적으로 조회했습니다.",
      data: {
        platformFeeCollector: platformFeeCollector,
        platformFeePercentage: feePercentage,
        platformFeeBasisPoints: platformFeePercentage.toString(),
      },
    });
  } catch (error) {
    console.error("[getPlatformFeeInfo] 오류:", error);
    res.status(500).json({
      success: false,
      message: "플랫폼 수수료 정보 조회 중 오류가 발생했습니다.",
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
  requestPurchase,
  confirmPurchase,
  cancelPurchase,
  getPurchaseRequest,
  getProjectPurchaseRequests,
  setActive,
  getBrandPendingProjects,
  getMyPurchaseRequests,
  getPlatformFeeInfo,
};
