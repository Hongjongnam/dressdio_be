let service = {};
const logger = require("../utils/logger.js");
let axios = require("axios");
let crypto = require("crypto");
let CryptoJS = require("crypto-js");
let qs = require("qs");
const { abcWalletBaseUrl } = require("../config/web3.js");

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
    console.log("getWallet error:", error);
    if (axios.isAxiosError(error)) {
      if (error.response?.data["code"] == 606) {
        return error.response.data.msg;
      } else {
        const errorMsg = `HTTP ${error.response?.status}: ${
          error.response?.data?.msg || error.message
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
    console.log("createWallet error:", error);
    if (axios.isAxiosError(error)) {
      if (error.response?.data["code"] == 606) {
        return error.response.data.msg;
      } else {
        const errorMsg = `HTTP ${error.response?.status}: ${
          error.response?.data?.msg || error.message
        }`;
        throw new Error(errorMsg);
      }
    }

    throw new Error(error.message || "Unknown error in createWallet");
  }
};

module.exports = service;
