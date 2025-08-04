let service = {};
const logger = require("../utils/logger.js");
let axios = require("axios");
let crypto = require("crypto");
let CryptoJS = require("crypto-js");
let qs = require("qs");
const { abcWalletBaseUrl } = require("../config/web3.js");
const authService = require("./auth.js");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SECURE_CHANNEL_MESSAGE = process.env.SECURE_CHANNEL_MESSAGE;
const SERVICE_ID = process.env.SERVICE_ID;

service.getWallet = async (accessToken) => {
  try {
    const urlStr = `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/info`;
    const walletRes = await axios.get(urlStr, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const wallet = walletRes.data;
    if (wallet && wallet.accounts && wallet.accounts.length > 0) {
      return { address: wallet.accounts[0]?.sid, email: wallet.email };
    } else {
      throw new Error("Problem while fetching Wallets");
    }
  } catch (error) {
    logger.error("getWallet error:", error);
    if (axios.isAxiosError(error)) {
      if (
        error.response?.status === 401 &&
        error.response?.data?.message === "The token has expired."
      ) {
        const tokenError = new Error("Token has expired");
        tokenError.code = "TOKEN_EXPIRED";
        throw tokenError;
      }

      if (error.response?.data["code"] == 606) {
        // 지갑이 없는 경우 null 반환
        return null;
      } else {
        const errorMsg = `HTTP ${error.response?.status}: ${
          error.response?.data?.message ||
          error.response?.data?.msg ||
          error.message
        }`;
        throw new Error(errorMsg);
      }
    }

    throw new Error(error.message || "Unknown error in getWallet");
  }
};

service.createWallet = async (
  email,
  deviceEncryptedPassword,
  channelId,
  accessToken
) => {
  try {
    const urlStr = `${abcWalletBaseUrl}/wapi/v2/mpc/wallets`;
    const data = qs.stringify({
      email: email,
      devicePassword: deviceEncryptedPassword,
    });
    const walletRes = await axios.post(urlStr, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
        "Secure-Channel": channelId,
      },
    });
    if (walletRes && walletRes.data) {
      return walletRes.data;
    } else {
      throw new Error("Problem while creating Wallet");
    }
  } catch (error) {
    logger.error("createWallet error:", error.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response) {
      const { data } = error.response;
      // ABC WaaS는 잘못된 비밀번호에 대해 612 코드를 반환.
      if (
        data.code === 612 ||
        (data.msg && data.msg.toLowerCase().includes("password")) ||
        (data.message && data.message.toLowerCase().includes("password"))
      ) {
        throw new Error("Invalid device password");
      }

      if (
        error.response?.status === 401 &&
        error.response?.data?.message === "The token has expired."
      ) {
        const tokenError = new Error("Token has expired");
        tokenError.code = "TOKEN_EXPIRED";
        throw tokenError;
      }

      const errorMsg = `HTTP ${error.response.status}: ${
        data.message || data.msg || "An unknown error occurred"
      }`;
      throw new Error(errorMsg);
    }

    throw new Error(error.message || "Unknown error in createWallet");
  }
};

/**
 * KeyShare와 devicePassword의 유효성을 검증합니다.
 * 모든 로직을 authService에 위임하여 중복을 제거하고 일관성을 유지합니다.
 * @param {object} secureChannel - authService에서 생성된 보안 채널 객체
 * @param {string} pvencstr - localStorage에서 온 암호화된 키 조각
 * @param {string} devicePassword - 사용자가 입력한 비밀번호 원문
 * @param {string} accessToken - 인증 JWT
 * @returns {Promise<boolean>} - 검증 성공 여부
 */
service.verifyPasswordWithShare = async (
  secureChannel,
  pvencstr,
  devicePassword,
  accessToken
) => {
  // 실제 검증 로직을 authService의 새 함수로 위임
  return await authService.validatePasswordWithKeyShare(
    secureChannel,
    pvencstr,
    devicePassword,
    accessToken
  );
};

module.exports = service;
