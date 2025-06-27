const { web3, dpTokenContract } = require("../../config/web3");
const { uploadFileToIPFS, uploadJSONToIPFS } = require("../../services/upload");

// faucet에서만 직접 .env의 DRESSDIO_ADMIN_WALLET_ADDRESS, DRESSDIO_ADMIN_PRIVATE_KEY 사용
const FAUCET_ADMIN_ADDRESS = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;
const FAUCET_ADMIN_PRIVATE_KEY = process.env.DRESSDIO_ADMIN_PRIVATE_KEY;

let faucetLock = false;

// POST /api/utils/faucet
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
    const { walletAddress } = req.body;
    if (!walletAddress || !web3.utils.isAddress(walletAddress)) {
      return res
        .status(400)
        .json({ success: false, message: "유효한 지갑 주소를 입력하세요." });
    }

    // 10 DP (10 * 10^18 wei)
    const amount = web3.utils.toWei("10", "ether");

    // 트랜잭션 데이터 생성 (ERC20 transfer)
    const data = dpTokenContract.methods
      .transfer(walletAddress, amount)
      .encodeABI();

    // 최신 web3 및 EIP-1559 호환 트랜잭션 옵션
    const gas = 100000;
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(
      FAUCET_ADMIN_ADDRESS,
      "pending"
    );
    console.log(FAUCET_ADMIN_ADDRESS, "FAUCET_ADMIN_ADDRESS");

    const tx = {
      from: FAUCET_ADMIN_ADDRESS,
      to: dpTokenContract.options.address,
      data,
      gas: web3.utils.toHex(gas),
      gasPrice: web3.utils.toHex(gasPrice),
      nonce: web3.utils.toHex(nonce),
    };

    // 서명 및 전송
    const signed = await web3.eth.accounts.signTransaction(
      tx,
      FAUCET_ADMIN_PRIVATE_KEY
    );
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

    return res.json({
      success: true,
      txHash: receipt.transactionHash,
      message: "DP 토큰이 성공적으로 지급되었습니다.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    faucetLock = false;
  }
};

// POST /api/utils/ipfs/upload-file
exports.uploadFileToIPFS = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "업로드할 파일을 선택해주세요.",
      });
    }

    const file = req.files[0];
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
