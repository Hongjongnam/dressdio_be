let service = {};
const logger = require("../utils/logger.js");
let axios = require("axios");
let qs = require("qs");
const { ethers, toBeHex, keccak256 } = require("ethers");
const { web3, abcWalletBaseUrl } = require("../config/web3.js");

const authService = require("./auth.js");

service.signTransaction = async (
  secureChannel,
  walletData,
  transactionData,
  accessToken
) => {
  try {
    let nonce = await web3.eth.getTransactionCount(walletData.sid, "pending");
    let gasPrice = await web3.eth.getGasPrice();
    let gasEstimate = 450000;
    try {
      // data 필드가 없거나 빈 문자열이면 0x로 설정
      const safeData =
        transactionData.data && transactionData.data.trim() !== ""
          ? transactionData.data
          : "0x";

      gasEstimate = await web3.eth.estimateGas({
        from: walletData.sid,
        to: transactionData.to,
        data: safeData,
        value: web3.utils.toWei(transactionData.value, "ether"), // ETH 단위를 wei로 변환
      });
      console.log("GAS PRICE: " + gasPrice);
      console.log("GAS ESTIMATE: " + gasEstimate);
    } catch (error) {
      console.log("가스 추정 실패, 기본값 사용:", error.message);
      // 복잡한 스마트 컨트랙트 함수의 경우 더 높은 가스 한도 사용
      gasEstimate = 2000000; // 2M 가스로 증가
    }

    let gasLimit = Math.floor(parseInt(gasEstimate) * 1.5); // 50% 버퍼로 증가

    // Convert value from ETH to wei first, then to BigInt
    const valueInWei =
      transactionData.value === "0"
        ? "0"
        : web3.utils.toWei(transactionData.value, "ether"); // ETH 단위를 wei로 변환

    // Handle nonce properly - convert to string and check for zero
    const nonceStr = nonce.toString();
    const isNonceZero = nonceStr === "0" || parseInt(nonceStr) === 0;

    // Handle gasPrice properly - convert to string and check for zero
    const gasPriceStr = gasPrice.toString();
    const isGasPriceZero = gasPriceStr === "0" || parseInt(gasPriceStr) === 0;

    const txArray = [
      isNonceZero ? "0x" : toBeHex(BigInt(nonce)),
      isGasPriceZero ? "0x" : toBeHex(BigInt(gasPrice)),
      toBeHex(BigInt(gasLimit)),
      transactionData.to,
      valueInWei === "0" ? "0x" : toBeHex(BigInt(valueInWei)),
      transactionData.data || "0x",
    ];
    console.log(txArray);

    const rlpEncodedTx = ethers.encodeRlp(txArray);

    const txHash = keccak256(rlpEncodedTx);

    let signResult = await service.signHash(
      secureChannel,
      walletData,
      { hash: txHash },
      accessToken
    );

    logger.info("ABC WaaS sign/hash API response:", signResult);

    // 응답 객체에 에러가 있는지 또는 필수 필드가 없는지 확인
    if (signResult.iserr || !signResult.signstr) {
      const errorMessage =
        signResult.msg ||
        signResult.message ||
        "Unknown signing error from API";
      logger.error("Error from sign/hash API:", errorMessage);
      throw new Error(errorMessage);
    }

    let signobj = JSON.parse(signResult.signstr);
    console.log(signobj);

    const v = toBeHex(BigInt(27 + parseInt(signobj.sig_list[0].vsource))); //toBeHex(27); // 27 + vsource + 2 * chainId or 27+vsource
    const r = toBeHex(BigInt(signobj.sig_list[0].r));
    const s = toBeHex(BigInt(signobj.sig_list[0].s));
    const signedTxArray = [...txArray, v, r, s];
    const signedRlpEncodedTx = ethers.encodeRlp(signedTxArray);
    console.log(signedRlpEncodedTx);
    return signedRlpEncodedTx;
  } catch (error) {
    console.log(error);
    throw new Error(`Transaction signing failed: ${error}`);
  }
};

service.signHash = async (
  secureChannel,
  walletData,
  transactionData,
  accessToken
) => {
  // WaaS sign/hash API는 transport를 위해 모든 민감 정보를
  // 현재 보안 채널로 다시 암호화해야 합니다.
  const encDP = authService.encrypt(
    secureChannel,
    walletData.encryptDevicePassword
  );
  const epvencstr = authService.encrypt(secureChannel, walletData.pvencstr);
  const ewid = authService.encrypt(secureChannel, String(walletData.wid));

  try {
    const inputData = {
      encryptDevicePassword: encDP,
      pvencstr: epvencstr,
      uid: walletData.uid,
      wid: ewid,
      sid: walletData.sid, // sid는 주소이므로 암호화하지 않음
      hash: transactionData.hash,
    };

    const data = qs.stringify(inputData);

    const response = await axios.post(
      `${abcWalletBaseUrl}/wapi/v2/sign/hash`,
      data,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Secure-Channel": secureChannel.ChannelID,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.log(error);
    throw new Error(`Message signing failed: ${error}`);
  }
};

service.sendTransaction = async (signedSerializeTx) => {
  try {
    console.log("sendTransaction called with:", signedSerializeTx);
    console.log("Sending transaction to blockchain...");

    const receipt = await web3.eth.sendSignedTransaction(signedSerializeTx);

    console.log("Transaction receipt:", receipt);
    console.log("Transaction hash:", receipt.transactionHash);

    return receipt;
  } catch (error) {
    console.log("sendTransaction error:", error);
    console.log("Error message:", error.message);
    console.log("Error details:", error);
    throw new Error(error.message);
  }
};

service.getTransactionReceipt = async (transactionHash) => {
  try {
    const receipt = await web3.eth.getTransactionReceipt(transactionHash);
    if (receipt) {
      return receipt;
    } else {
      throw new Error("Transaction not found");
    }
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

// Faucet용 DP 토큰 전송 함수 (관리자 프라이빗 키 사용)
service.transferDP = async (toAddress, amountInWei) => {
  try {
    const adminAddress = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;
    const adminPrivateKey = process.env.DRESSDIO_ADMIN_PRIVATE_KEY;

    if (!adminAddress || !adminPrivateKey) {
      throw new Error("Admin wallet address or private key not configured");
    }

    // DP 토큰 컨트랙트 ABI (transfer 함수만)
    const dpTokenAbi = [
      {
        constant: false,
        inputs: [
          { name: "_to", type: "address" },
          { name: "_value", type: "uint256" },
        ],
        name: "transfer",
        outputs: [{ name: "", type: "bool" }],
        type: "function",
      },
    ];

    const dpTokenAddress = process.env.DP_TOKEN_ADDRESS;
    if (!dpTokenAddress) {
      throw new Error("DP_TOKEN_ADDRESS not configured");
    }

    const dpTokenContract = new web3.eth.Contract(dpTokenAbi, dpTokenAddress);

    // transfer 함수 호출 데이터 생성
    const transferData = dpTokenContract.methods
      .transfer(toAddress, amountInWei)
      .encodeABI();

    // 트랜잭션 객체 생성
    const nonce = await web3.eth.getTransactionCount(adminAddress, "pending");
    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: adminAddress,
      to: dpTokenAddress,
      data: transferData,
      value: "0",
      nonce: nonce,
      gasPrice: gasPrice,
    };

    // 가스 추정
    const gasEstimate = await web3.eth.estimateGas(tx);
    tx.gas = Math.floor(parseInt(gasEstimate) * 1.2); // 20% 버퍼

    // 트랜잭션 서명
    const signedTx = await web3.eth.accounts.signTransaction(
      tx,
      adminPrivateKey
    );

    // 트랜잭션 전송
    const receipt = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );

    logger.info("DP token transfer successful:", {
      from: adminAddress,
      to: toAddress,
      amount: web3.utils.fromWei(amountInWei, "ether"),
      txHash: receipt.transactionHash,
    });

    return receipt;
  } catch (error) {
    logger.error("DP token transfer failed:", error);
    throw new Error(`DP token transfer failed: ${error.message}`);
  }
};

/**
 * Polygon 네트워크용 트랜잭션 서명
 * Besu와 달리 가스비가 필요하며, EIP-1559 사용
 */
service.signTransactionForPolygon = async (
  secureChannel,
  walletData,
  transactionData,
  accessToken
) => {
  try {
    const { Web3 } = require("web3");
    const POLYGON_RPC_URL =
      process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const polygonWeb3 = new Web3(POLYGON_RPC_URL);
    const POLYGON_CHAIN_ID = 137;

    logger.info(
      "[POLYGON_SIGN] Starting Polygon transaction signing (EIP-1559)..."
    );
    logger.info("[POLYGON_SIGN] Using RPC:", POLYGON_RPC_URL);

    // 1. Nonce 가져오기 (Retry 로직 포함)
    let nonce;
    let retries = 3;
    while (retries > 0) {
      try {
        nonce = await polygonWeb3.eth.getTransactionCount(
          walletData.sid,
          "pending"
        );
        break;
      } catch (nonceError) {
        retries--;
        if (retries === 0) throw nonceError;
        logger.warn(
          `[POLYGON_SIGN] Failed to get nonce, retrying... (${retries} left)`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
      }
    }

    // 2. 가스 추정
    let gasEstimate = 100000;
    try {
      const safeData =
        transactionData.data && transactionData.data.trim() !== ""
          ? transactionData.data
          : "0x";

      gasEstimate = await polygonWeb3.eth.estimateGas({
        from: walletData.sid,
        to: transactionData.to,
        data: safeData,
        value: transactionData.value || "0",
      });
      logger.info("[POLYGON_SIGN] Gas estimated:", gasEstimate);
    } catch (error) {
      logger.warn(
        "[POLYGON_SIGN] Gas estimation failed, using default:",
        error.message
      );
      gasEstimate = 100000;
    }

    const gasLimit = Math.floor(parseInt(gasEstimate) * 1.5);

    // 3. EIP-1559 가스비 설정 (Polygon)
    const feeData = await polygonWeb3.eth.getBlock("latest");
    const baseFeePerGas = feeData.baseFeePerGas || BigInt(30000000000); // 30 Gwei
    const maxPriorityFeePerGas = BigInt(40000000000); // 40 Gwei (팁)
    const maxFeePerGas = baseFeePerGas * BigInt(2) + maxPriorityFeePerGas;

    logger.info("[POLYGON_SIGN] EIP-1559 fees:", {
      nonce,
      gasLimit,
      baseFeePerGas: baseFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
    });

    // 4. EIP-1559 트랜잭션 배열 생성 (Type 2)
    const valueInWei =
      transactionData.value === "0" || !transactionData.value
        ? "0"
        : transactionData.value;

    // EIP-1559에서 0 값은 "0x" (빈 값)으로 인코딩해야 함
    // Helper function: BigInt 값을 hex로 변환, 0이면 "0x" 반환
    const toHexOrEmpty = (value) => {
      const bigIntValue = BigInt(value);
      return bigIntValue === BigInt(0) ? "0x" : toBeHex(bigIntValue);
    };

    const txArray = [
      toBeHex(BigInt(POLYGON_CHAIN_ID)), // chainId (항상 137이므로 0이 아님)
      toHexOrEmpty(nonce), // nonce
      toHexOrEmpty(maxPriorityFeePerGas), // maxPriorityFeePerGas
      toHexOrEmpty(maxFeePerGas), // maxFeePerGas
      toHexOrEmpty(gasLimit), // gasLimit
      transactionData.to, // to
      valueInWei === "0" ? "0x" : toBeHex(BigInt(valueInWei)), // value
      transactionData.data || "0x", // data
      [], // accessList (빈 배열)
    ];

    logger.info("[POLYGON_SIGN] Transaction array created for EIP-1559", {
      chainId: txArray[0],
      nonce: txArray[1],
      maxPriorityFeePerGas: txArray[2],
      maxFeePerGas: txArray[3],
      gasLimit: txArray[4],
      to: txArray[5],
      value: txArray[6],
      dataLength: txArray[7].length,
    });

    // EIP-1559는 0x02 타입 프리픽스 필요
    const rlpEncodedTx = ethers.encodeRlp(txArray);
    const txHashPayload = "0x02" + rlpEncodedTx.slice(2);
    const txHash = keccak256(txHashPayload);

    logger.info("[POLYGON_SIGN] Transaction hash computed:", txHash);

    // 5. ABC Wallet WaaS Hash Sign API로 서명
    let signResult = await service.signHash(
      secureChannel,
      walletData,
      { hash: txHash },
      accessToken
    );

    logger.info("[POLYGON_SIGN] Sign result received");

    if (signResult.iserr || !signResult.signstr) {
      const errorMessage =
        signResult.msg ||
        signResult.message ||
        signResult.errmsg ||
        "Unknown signing error from ABC Wallet API";
      logger.error("[POLYGON_SIGN] Signing error:", errorMessage);
      throw new Error(errorMessage);
    }

    let signobj = JSON.parse(signResult.signstr);
    logger.info("[POLYGON_SIGN] Signature parsed successfully");

    // EIP-1559에서 v 값 계산: vsource만 사용 (0 또는 1)
    // 0 값도 toHexOrEmpty를 사용하여 "0x"로 인코딩
    const vValue = parseInt(signobj.sig_list[0].vsource);
    const v = toHexOrEmpty(vValue);
    const r = toHexOrEmpty(signobj.sig_list[0].r);
    const s = toHexOrEmpty(signobj.sig_list[0].s);

    logger.info("[POLYGON_SIGN] Signature values:", {
      vsource: vValue,
      v,
      rLength: signobj.sig_list[0].r.length,
      sLength: signobj.sig_list[0].s.length,
    });

    const signedTxArray = [...txArray, v, r, s];
    const signedRlpEncodedTx =
      "0x02" + ethers.encodeRlp(signedTxArray).slice(2);

    logger.info("[POLYGON_SIGN] Transaction signed successfully");
    return signedRlpEncodedTx;
  } catch (error) {
    logger.error("[POLYGON_SIGN] Transaction signing failed:", error);
    throw new Error(`Polygon transaction signing failed: ${error.message}`);
  }
};

/**
 * Polygon 네트워크로 서명된 트랜잭션 전송
 */
service.sendTransactionToPolygon = async (signedSerializeTx) => {
  try {
    const { Web3 } = require("web3");
    const POLYGON_RPC_URL =
      process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const polygonWeb3 = new Web3(POLYGON_RPC_URL);

    logger.info("[POLYGON_SEND] Sending transaction to Polygon network...");
    logger.info("[POLYGON_SEND] Signed transaction:", {
      txLength: signedSerializeTx.length,
      txPreview: signedSerializeTx.substring(0, 50) + "...",
    });

    const receipt = await polygonWeb3.eth.sendSignedTransaction(
      signedSerializeTx
    );

    logger.info("[POLYGON_SEND] Transaction successful:", {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    });

    return receipt;
  } catch (error) {
    logger.error("[POLYGON_SEND] Transaction failed:", {
      errorMessage: error.message,
      errorCode: error.code,
      errorReason: error.reason,
      errorData: error.data,
    });

    // 더 구체적인 에러 메시지 전달
    if (error.message) {
      throw new Error(`Polygon transaction failed: ${error.message}`);
    } else if (error.reason) {
      throw new Error(`Polygon transaction failed: ${error.reason}`);
    } else {
      throw new Error("Polygon transaction failed: Unknown error");
    }
  }
};

module.exports = service;
