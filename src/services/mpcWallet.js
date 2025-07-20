const logger = require("../utils/logger.js");
const axios = require("axios");
const qs = require("qs");
const { abcWalletBaseUrl } = require("../config/web3.js");
const authService = require("./auth.js");

let service = {};

/**
 * MPC 지갑 생성/복구 - 로그인/회원가입 시에만 호출
 * 응답 데이터를 프론트엔드 로컬스토리지에 저장해야 함
 */
service.createOrRecoverWallet = async (email, devicePassword, accessToken) => {
  try {
    // 1. 보안 채널 생성 (accessToken 전달)
    const secureChannel = await authService.createSecureChannel(accessToken);

    // 2. devicePassword 암호화
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      devicePassword
    );

    // 3. MPC 지갑 생성/복구 API 호출
    const urlStr = `${abcWalletBaseUrl}/wapi/v2/mpc/wallets`;
    const data = qs.stringify({
      email: email, // email 파라미터를 직접 사용
      devicePassword: encryptedDevicePassword,
    });

    const response = await axios.post(urlStr, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
        "Secure-Channel": secureChannel.ChannelID,
      },
    });

    if (response && response.data) {
      const walletData = response.data;

      logger.info("MPC 지갑 생성/복구 성공:", {
        uid: walletData.uid,
        wid: walletData.wid,
        sid: walletData.sid,
        email: email, // 로그에 email 기록
        timestamp: new Date().toISOString(),
      });

      // WaaS API의 응답을 그대로 반환하도록 수정합니다.
      // 컨트롤러에서 이 데이터를 받아 필요한 부분만 저장하고 클라이언트에 응답합니다.
      return walletData;
    } else {
      throw new Error("Problem while creating/recovering MPC wallet");
    }
  } catch (error) {
    logger.error("MPC 지갑 생성/복구 오류:", error);

    if (axios.isAxiosError(error)) {
      if (
        error.response?.status === 401 &&
        error.response?.data?.message === "The token has expired."
      ) {
        const tokenError = new Error("Token has expired");
        tokenError.code = "TOKEN_EXPIRED";
        throw tokenError;
      }
      throw new Error(error.response?.data?.message || "MPC wallet API error");
    }
    throw error;
  }
};

/**
 * 저장된 지갑 정보 조회 - 기존 방식 유지
 */
service.getWalletInfo = async (accessToken) => {
  try {
    const urlStr = `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/info`;
    const response = await axios.get(urlStr, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const wallet = response.data;
    if (wallet && wallet.accounts && wallet.accounts.length > 0) {
      return {
        address: wallet.accounts[0]?.sid,
        email: wallet.email,
        uid: wallet.uid,
        wid: wallet.wid,
      };
    } else {
      throw new Error("Problem while fetching wallet info");
    }
  } catch (error) {
    logger.error("getWalletInfo error:", error);
    throw error;
  }
};

/**
 * 저장된 지갑 데이터로 해시 서명 - 새로운 방식
 * 프론트엔드에서 로컬스토리지의 데이터를 보내면 바로 서명
 */
service.signHashWithStoredData = async (
  storedWalletData,
  devicePassword,
  hash,
  accessToken
) => {
  try {
    // 1. 보안 채널 생성
    const secureChannel = await authService.createSecureChannel();

    // 2. 필요한 데이터 암호화
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      devicePassword // 암호화되지 않은 원본 devicePassword를 암호화해야 합니다.
    );
    const encryptedWid = authService.encrypt(
      secureChannel,
      String(storedWalletData.wid) // wid를 문자열로 변환 후 암호화
    );

    // 3. Hash sign API 호출
    const inputData = {
      encryptDevicePassword: encryptedDevicePassword,
      pvencstr: storedWalletData.pvencstr, // pvencstr은 원본 그대로 전송
      uid: storedWalletData.uid,
      wid: encryptedWid,
      sid: storedWalletData.sid,
      hash: hash,
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

    logger.info("Hash 서명 성공:", {
      uid: storedWalletData.uid,
      sid: storedWalletData.sid,
      timestamp: new Date().toISOString(),
    });

    return response.data;
  } catch (error) {
    logger.error("Hash 서명 실패:", error);
    throw new Error(`Hash signing failed: ${error.message}`);
  }
};

/**
 * 저장된 지갑 데이터 검증 - 패스워드 검증
 */
service.validateStoredWalletData = async (
  storedWalletData,
  devicePassword,
  accessToken
) => {
  try {
    // 1. 보안 채널 생성
    const secureChannel = await authService.createSecureChannel();

    // 2. 데이터 암호화
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      devicePassword
    );
    const encryptedStoredPassword = authService.encrypt(
      secureChannel,
      storedWalletData.encryptDevicePassword
    );

    // 3. 패스워드 검증 API 호출
    const data = qs.stringify({
      devicePassword: encryptedDevicePassword,
      encryptDevicePassword: encryptedStoredPassword,
    });

    const response = await axios.post(
      `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/check/device-password`,
      data,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Secure-Channel": secureChannel.ChannelID,
        },
      }
    );

    return response.data; // {result: true/false}
  } catch (error) {
    logger.error("지갑 데이터 검증 실패:", error);
    throw new Error(`Wallet data validation failed: ${error.message}`);
  }
};

/**
 * KeyShare 패스워드 검증
 */
service.validateKeyShare = async (
  storedWalletData,
  devicePassword,
  accessToken
) => {
  try {
    // 1. 보안 채널 생성
    const secureChannel = await authService.createSecureChannel();

    // 2. 데이터 암호화
    const encryptedDevicePassword = authService.encrypt(
      secureChannel,
      devicePassword
    );

    // 3. KeyShare 검증 API 호출
    const data = qs.stringify({
      devicePassword: encryptedDevicePassword,
      pvencstr: storedWalletData.pvencstr, // pvencstr은 원본 그대로 전송
    });

    const response = await axios.post(
      `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/check/device-password/share`,
      data,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Secure-Channel": secureChannel.ChannelID,
        },
      }
    );

    return response.data; // {result: true/false}
  } catch (error) {
    logger.error("KeyShare 검증 실패:", error);
    throw new Error(`KeyShare validation failed: ${error.message}`);
  }
};

module.exports = service;
