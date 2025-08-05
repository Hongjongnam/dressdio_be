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

module.exports = service;
