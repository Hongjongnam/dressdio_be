const web3 = require("../config/web3").web3;
const authService = require("./auth");
const blockchainService = require("./blockchain");
const logger = require("../utils/logger");

/**
 * 저장된 MPC 지갑 데이터와 현재 devicePassword를 사용하여 트랜잭션을 실행하는 유일하고 올바른 함수.
 * (지갑을 새로 생성하지 않고, localStorage의 데이터를 사용함)
 * 1. 보안 채널 생성 (단일 채널 재사용)
 * 2. 트랜잭션 서명 (저장된 데이터와 현재 비밀번호 사용)
 * 3. 트랜잭션 전송
 *
 * @param {object} storedWalletData - localStorage에서 가져온 지갑 데이터
 * @param {string} devicePassword - 사용자가 현재 입력한 장치 비밀번호
 * @param {object} txData - 전송할 트랜잭션 데이터 {to, data, value}
 * @param {string} accessToken - 사용자 인증을 위한 액세스 토큰
 * @returns {Promise<string>} - 성공 시 트랜잭션 해시 반환
 */
async function executeTransactionWithStoredData(
  storedWalletData,
  devicePassword,
  txData,
  accessToken
) {
  logger.info("[MPC_REF_V4] Executing transaction with single secure channel", {
    to: txData.to,
    sid: storedWalletData.sid,
  });

  if (!storedWalletData || !devicePassword || !txData || !accessToken) {
    throw new Error(
      "storedWalletData, devicePassword, txData, and accessToken are all required."
    );
  }

  // --- 단일 보안 채널 생성 ---
  logger.info(
    "[MPC_REF_V4] Creating single secure channel for entire transaction..."
  );
  const secureChannel = await authService.createSecureChannel(accessToken);

  logger.info("[MPC_REF_V4] Secure channel created successfully", {
    channelId: secureChannel.ChannelID,
    serverPublicKey: secureChannel.ServerPublicKey.substring(0, 20) + "...",
  });

  // --- 1단계: 비밀번호 검증 (authService 직접 호출) ---
  logger.info("[MPC_REF_V4] Step 1: Verifying password with secure channel...");
  const isPasswordValid = await authService.validatePasswordWithKeyShare(
    secureChannel,
    storedWalletData.pvencstr,
    devicePassword,
    accessToken
  );

  if (!isPasswordValid) {
    logger.error("[MPC_REF_V4] Step 1 FAILED: Invalid device password.");
    throw new Error("Invalid device password");
  }
  logger.info("[MPC_REF_V4] Step 1 SUCCEEDED: Device password is valid.");

  // --- 2단계: 트랜잭션 서명 및 전송 (동일한 보안 채널 재사용) ---
  logger.info(
    "[MPC_REF_V4] Step 2: Signing transaction with same secure channel..."
  );
  const signedTx = await blockchainService.signTransaction(
    secureChannel,
    storedWalletData,
    txData,
    accessToken
  );

  const receipt = await blockchainService.sendTransaction(signedTx);

  logger.info(
    `[MPC_REF_V4] Transaction sent successfully. TxHash: ${receipt.transactionHash}`
  );
  return receipt;
}

/**
 * ERC20 토큰 잔액 조회
 */
async function getTokenBalance(address, tokenAddress) {
  try {
    const tokenAbi = [
      {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
      },
    ];
    const contract = new web3.eth.Contract(tokenAbi, tokenAddress);
    const balance = await contract.methods.balanceOf(address).call();
    logger.info("Token balance retrieved:", { address, tokenAddress, balance });
    return balance.toString();
  } catch (error) {
    logger.error("getTokenBalance failed:", error);
    throw new Error(`Failed to retrieve token balance: ${error.message}`);
  }
}

module.exports = {
  getTokenBalance,
  executeTransactionWithStoredData,
};
