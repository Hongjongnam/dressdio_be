const {
  web3,
  adminAccount,
  CHAIN_ID,
  checkConnection,
  sbtContract,
  dressdioAdminAccount,
} = require("../../config/web3");
const SBT = require("../../models/sbt");

// 하드코딩된 플랫폼 어드민 지갑주소
const PLATFORM_ADMIN_WALLET_ADDRESS =
  "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73";

// 크리에이터 타입별 IPFS URI 매핑
const typeToIpfsUri = {
  artist: "https://ipfs.io/ipfs/QmVjNKowy3nqoaA7atZe615R7XcVcu2eMPknmimHnbybyV",
  influencer:
    "https://ipfs.io/ipfs/QmWA53Ma6jos1SqWA8b8ZuRKJh2bm5U26YYE5soHmKR38T",
  brand: "https://ipfs.io/ipfs/QmX39UUBB2KVGs27qXscrqZYLmibDcUSUx5pnf8MoFEDHC",
};

/**
 * SBT 컨트롤러
 * Soulbound Token 발행 및 관리 기능
 */

/**
 * SBT 발행
 * @param {Object} req - Express request object
 * @param {string} req.body.platformAdminWalletAddress - 플랫폼 어드민 지갑 주소
 * @param {string} req.body.creatorWalletAddress - 지갑 주소
 * @param {string} req.body.creatorType - 크리에이터 타입 (예: designer, brand, etc.)
 * @param {string} req.body.description - SBT 설명
 * @param {Object} res - Express response object
 */
exports.mintSbt = async (req, res) => {
  try {
    const {
      platformAdminWalletAddress,
      creatorWalletAddress,
      creatorType,
      description,
    } = req.body;

    // 필수 파라미터 검증
    if (
      !platformAdminWalletAddress ||
      !creatorWalletAddress ||
      !creatorType ||
      !description
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: platformAdminWalletAddress, creatorWalletAddress, creatorType, description",
      });
    }

    // 플랫폼 관리자 지갑주소 검증
    if (
      platformAdminWalletAddress.toLowerCase() !==
      PLATFORM_ADMIN_WALLET_ADDRESS.toLowerCase()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Invalid platform admin wallet address",
      });
    }

    // 지갑 주소 형식 검증
    if (!/^0x[a-fA-F0-9]{40}$/.test(creatorWalletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid creator wallet address format",
      });
    }

    // 크리에이터 타입 검증
    const validCreatorTypes = ["artist", "influencer", "brand"];
    if (!validCreatorTypes.includes(creatorType)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid creator type. Must be one of: ${validCreatorTypes.join(
          ", "
        )}`,
      });
    }
    // 이미 발행된 SBT가 있는지 확인
    const hasSbt = await sbtContract.methods
      .hasCreatorSbt(creatorWalletAddress, creatorType)
      .call();
    if (hasSbt) {
      return res.status(409).json({
        status: "error",
        message: "SBT already exists for this creator wallet address and type",
      });
    }

    // IPFS URI 선택
    const tokenUri = typeToIpfsUri[creatorType];

    // 트랜잭션 전송 전에 컨트랙트 상태 확인
    try {
      // SBT 존재 여부 확인
      const hasSbt = await sbtContract.methods
        .hasCreatorSbt(creatorWalletAddress, creatorType)
        .call();
      console.log("Has SBT:", hasSbt);

      if (hasSbt) {
        throw new Error(
          "SBT already exists for this creator wallet address and type"
        );
      }

      // 컨트랙트 소유자 확인
      const owner = await sbtContract.methods.owner().call();
      console.log("Contract owner:", owner);
      console.log("Dressdio admin address:", dressdioAdminAccount.address);

      if (owner.toLowerCase() !== dressdioAdminAccount.address.toLowerCase()) {
        throw new Error("Dressdio admin is not the contract owner");
      }

      // 크리에이터 타입 유효성 검사
      const validCreatorTypes = ["artist", "influencer", "brand"];
      if (!validCreatorTypes.includes(creatorType)) {
        throw new Error(
          `Invalid creator type. Must be one of: ${validCreatorTypes.join(
            ", "
          )}`
        );
      }

      // 트랜잭션 데이터 준비
      const mintData = sbtContract.methods
        .mint(
          creatorWalletAddress, // _to: SBT를 받을 주소
          creatorType, // _creatorType: 크리에이터 타입
          description, // _description: SBT 설명
          tokenUri // _tokenUri: IPFS URI
        )
        .encodeABI();

      console.log("Mint parameters:", {
        to: creatorWalletAddress,
        creatorType: creatorType,
        description: description,
        tokenUri: tokenUri,
      });

      // 트랜잭션 옵션 설정
      const nonce = await web3.eth.getTransactionCount(
        dressdioAdminAccount.address,
        "latest"
      );
      const gasLimit = 300000; // gas limit 증가

      const tx = {
        from: dressdioAdminAccount.address,
        to: sbtContract.options.address,
        data: mintData,
        gas: gasLimit,
        gasPrice: "0",
        nonce: nonce,
        chainId: 1337,
      };

      console.log("Transaction object:", tx);

      // 트랜잭션 서명
      const signedTx = await web3.eth.accounts.signTransaction(
        tx,
        dressdioAdminAccount.privateKey
      );
      console.log("Signed transaction:", signedTx);

      // 서명된 트랜잭션 전송
      const receipt = await web3.eth.sendSignedTransaction(
        signedTx.rawTransaction
      );
      console.log("Transaction receipt:", receipt);

      if (!receipt.status) {
        throw new Error("Transaction failed: " + JSON.stringify(receipt));
      }

      // 발행된 SBT 정보 조회
      const sbtInfo = await sbtContract.methods
        .getSBTInfoByAddress(creatorWalletAddress)
        .call();
      console.log("SBT Info:", sbtInfo);

      const newSbt = sbtInfo[sbtInfo.length - 1]; // 가장 최근에 발행된 SBT
      console.log("New SBT:", newSbt);

      // Save SBT data to database
      const sbtData = {
        tokenId: newSbt.tokenId.toString(),
        owner: newSbt.owner,
        creatorType: newSbt.creatorType,
        description: newSbt.description,
        tokenURI: newSbt.tokenUri,
        transactionHash: receipt.transactionHash,
        useCount: newSbt.useCount.toString(),
      };

      const savedSbt = await SBT.create(sbtData);
      console.log("Saved SBT to database:", savedSbt);

      res.status(201).json({
        status: "success",
        message: "SBT minted successfully",
        data: {
          transactionHash: receipt.transactionHash,
          sbtInfo: {
            tokenId: newSbt.tokenId.toString(),
            owner: newSbt.owner,
            creatorType: newSbt.creatorType,
            description: newSbt.description,
            tokenURI: newSbt.tokenUri,
            useCount: newSbt.useCount.toString(),
          },
        },
      });
    } catch (error) {
      console.error("Transaction error details:", {
        error: error.message,
        reason: error.reason,
        data: error.data,
        stack: error.stack,
      });

      // 에러 메시지 개선
      let errorMessage = "Failed to mint SBT";
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
  } catch (error) {
    console.error("SBT minting error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to mint SBT",
      error: error.message,
    });
  }
};

/**
 * 지갑 주소로 SBT 정보 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.walletAddress - 지갑 주소
 * @param {Object} res - Express response object
 */
exports.getSbtByWalletAddress = async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({
        status: "error",
        message: "Wallet address is required",
      });
    }

    // 지갑 주소 형식 검증
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid wallet address format",
      });
    }

    // 컨트랙트에서 SBT 정보 조회
    const sbtInfo = await sbtContract.methods
      .getSBTInfoByAddress(walletAddress)
      .call();

    if (!sbtInfo || sbtInfo.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address",
      });
    }

    // BigInt 값을 문자열로 변환하여 응답 데이터 포맷팅
    const formattedSbtInfo = sbtInfo.map((sbt) => ({
      tokenId: sbt.tokenId.toString(),
      owner: sbt.owner,
      creatorType: sbt.creatorType,
      description: sbt.description,
      tokenURI: sbt.tokenUri,
    }));

    res.status(200).json({
      status: "success",
      message: "SBT info retrieved successfully",
      data: formattedSbtInfo,
    });
  } catch (error) {
    console.error("SBT retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBT info",
      error: error.message,
    });
  }
};

exports.getAdminBalance = async (req, res) => {
  try {
    const { web3, adminAccount } = require("../../config/web3");
    const balanceWei = await web3.eth.getBalance(adminAccount.address);
    const balanceEth = web3.utils.fromWei(balanceWei, "ether");
    res.status(200).json({
      status: "success",
      address: adminAccount.address,
      balance: balanceEth,
      unit: "ETH",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch admin balance",
      error: error.message,
    });
  }
};

/**
 * 데이터베이스에서 지갑 주소로 SBT 정보 조회
 * @param {Object} req - Express request object
 * @param {string} req.params.walletAddress - 지갑 주소
 * @param {Object} res - Express response object
 */
exports.getSBT = async (req, res) => {
  try {
    const { walletAddress } = req.params;

    // 1. 필수 파라미터 검증
    if (!walletAddress) {
      return res.status(400).json({
        status: "error",
        message: "Wallet address is required",
      });
    }

    // 2. 지갑 주소 형식 검증
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid wallet address format",
      });
    }

    // 3. 데이터베이스에서 SBT 정보 조회
    const sbtInfo = await SBT.findAll({
      where: { owner: walletAddress },
      order: [["createdAt", "DESC"]], // 최신순 정렬
    });

    // 4. 결과가 없는 경우
    if (!sbtInfo || sbtInfo.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No SBT found for this wallet address",
      });
    }

    // 5. 응답 데이터 포맷팅
    const formattedSbtInfo = sbtInfo.map((sbt) => ({
      tokenId: sbt.tokenId,
      owner: sbt.owner,
      creatorType: sbt.creatorType,
      description: sbt.description,
      tokenURI: sbt.tokenURI,
      transactionHash: sbt.transactionHash,
      useCount: sbt.useCount,
      createdAt: sbt.createdAt,
      updatedAt: sbt.updatedAt,
    }));

    // 6. 성공 응답
    res.status(200).json({
      status: "success",
      message: "SBT info retrieved successfully from database",
      data: formattedSbtInfo,
    });
  } catch (error) {
    console.error("Database SBT retrieval error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve SBT info from database",
      error: error.message,
    });
  }
};
