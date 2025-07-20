console.log("auth.js loaded from:", __filename);
console.log("Current working directory:", process.cwd());
console.log("Trying to require:", require.resolve("../services/auth.js"));

let service = {};
const logger = require("../utils/logger.js");
let axios = require("axios");
let crypto = require("crypto");
let CryptoJS = require("crypto-js");
let qs = require("qs");
const { web3Config } = require("../config/web3");

// BASE_URL 상수를 제거하고, web3Config.abcWalletBaseUrl을 직접 사용하도록 통일합니다.
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SECURE_CHANNEL_MESSAGE = process.env.SECURE_CHANNEL_MESSAGE;
const SERVICE_ID = process.env.SERVICE_ID;

service.isUserExists = async (email) => {
  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/member/user-management/users/${email}?serviceid=${SERVICE_ID}`;
    await axios.get(urlStr);
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.data["code"] == 606) {
        return true;
      }
    }

    throw new Error(`Problem while verifying User`);
  }
};

service.sendCode = async (email, lang, template) => {
  try {
    const url = new URL(
      `${web3Config.abcWalletBaseUrl}/member/mail-service/${email}/sendcode`
    );

    url.searchParams.append("lang", lang);
    url.searchParams.append("template", template);

    await axios.get(url.toString());
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Problem while sending code`);
  }
};

service.verifyCode = async (email, code) => {
  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/member/mail-service/${email}/verifycode`;
    const formData = qs.stringify({
      code: code,
      serviceid: SERVICE_ID,
    });

    await axios.post(urlStr, formData);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Problem while verifying code`);
  }
};

service.registerUser = async (userObj) => {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  try {
    logger.info("registerUser called with:", {
      email: userObj.email,
      code: userObj.code,
      overage: userObj.overage,
      agree: userObj.agree,
      collect: userObj.collect,
      thirdParty: userObj.thirdParty,
      advertise: userObj.advertise,
      channelId: userObj.channelId,
    });

    logger.info("Environment variables check:");
    logger.info("BASE_URL:", web3Config.abcWalletBaseUrl);
    logger.info("CLIENT_ID:", CLIENT_ID ? "SET" : "NOT SET");
    logger.info("CLIENT_SECRET:", CLIENT_SECRET ? "SET" : "NOT SET");
    logger.info("SERVICE_ID:", SERVICE_ID);

    const urlStr = `${web3Config.abcWalletBaseUrl}/member/user-management/users/v2/adduser`;
    logger.info("Calling ABC WAAS API:", urlStr);

    const formData = qs.stringify({
      username: userObj.email,
      password: userObj.encryptedPassword,
      code: userObj.code,
      overage: userObj.overage,
      agree: userObj.agree,
      collect: userObj.collect,
      third_party: userObj.thirdParty,
      advertise: userObj.advertise,
      serviceid: SERVICE_ID,
    });

    logger.info("Request payload:", formData);

    const response = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
        "Secure-Channel": `${userObj.channelId}`,
      },
    });

    logger.info("ABC WAAS API response status:", response.status);
    logger.info("ABC WAAS API response data:", response.data);
  } catch (error) {
    logger.error("ABC WAAS API error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      },
    });

    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.msg || error.message);
    }

    throw new Error(`Problem while registering user`);
  }
};

service.loginUser = async (email, encryptedPassword, channelId) => {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/auth/auth-service/v2/login`;

    const formData = qs.stringify({
      grant_type: "password",
      username: email,
      password: encryptedPassword,
      audience: SERVICE_ID,
    });

    let loginRes = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
        "Secure-Channel": `${channelId}`,
      },
    });
    if (loginRes.status !== 200) {
      throw new Error(`Failed to create Secure Channel`);
    }
    return {
      accessToken: loginRes.data.access_token,
      refreshToken: loginRes.data.refresh_token,
      expireIn: loginRes.data.expire_in,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Problem while logging user`);
  }
};

service.refreshToken = async (refreshToken) => {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/auth/auth-service/v2/refresh`;

    const formData = qs.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    let refreshTokenRes = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
    });

    return {
      accessToken: refreshTokenRes.data.access_token,
      refreshToken: refreshTokenRes.data.refresh_token,
      expireIn: refreshTokenRes.data.expire_in,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Reissue Accesstoken failed`);
  }
};

/**
 * ===================================================================================
 *  보안 채널 (Secure Channel) 관련 함수들
 *  ABC WaaS 공식 문서 및 예제 코드(securechannel.ts)를 기반으로 전면 재작성
 * ===================================================================================
 */

function createKeypair() {
  const ecdh = crypto.createECDH("prime256v1"); // secp256r1의 별칭, Node.js crypto에서 인식하는 이름
  ecdh.generateKeys();
  return {
    privateKey: ecdh,
    publicKey: ecdh,
  };
}

function getAESCipher(privateKeyStr, publicKeyStr) {
  const privateKeyBytes = Buffer.from(privateKeyStr, "hex");
  const publicKeyBytes = Buffer.from(publicKeyStr, "hex");

  const ecdh = crypto.createECDH("prime256v1"); // secp256r1의 별칭, Node.js crypto에서 인식하는 이름
  ecdh.setPrivateKey(privateKeyBytes);
  const sharedSecret = ecdh.computeSecret(publicKeyBytes); // Buffer 반환

  const key = sharedSecret.slice(0, 16); // 16 bytes for key
  const iv = sharedSecret.slice(16, 32); // 16 bytes for iv

  return { block: key, iv: iv };
}

service.createSecureChannel = async (accessToken = null) => {
  try {
    const keyPair = createKeypair();
    const secureChannelMessage = "ahnlabblockchaincompany"; // 고정 메시지

    const formData = qs.stringify({
      pubkey: keyPair.publicKey.getPublicKey("hex"),
      plain: secureChannelMessage,
    });

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // 공식 문서 기준 올바른 엔드포인트
    const urlStr = `${web3Config.abcWalletBaseUrl}/secure/channel/create`;
    const response = await axios.post(urlStr, formData, { headers });

    if (response.status !== 200) {
      throw new Error(
        `Failed to create secure channel, status code: ${response.status}`
      );
    }

    const secureChannel = {
      ChannelID: response.data.channelid,
      Encrypted: response.data.encrypted,
      ServerPublicKey: response.data.publickey, // 공식 문서 기준 올바른 필드명
      Message: secureChannelMessage,
      PrivateKey: keyPair.privateKey.getPrivateKey("hex"),
    };

    // 검증 단계 (선택적이지만 안전을 위해 추가)
    const decryptedMessage = service.decrypt(
      secureChannel,
      secureChannel.Encrypted
    );
    if (secureChannel.Message !== decryptedMessage) {
      throw new Error("Secure channel verification failed.");
    }

    logger.info("Secure Channel created and verified successfully.");
    return secureChannel;
  } catch (error) {
    logger.error("createSecureChannel error:", error);
    throw error;
  }
};

service.encrypt = (secureChannel, message) => {
  const { block, iv } = getAESCipher(
    secureChannel.PrivateKey,
    secureChannel.ServerPublicKey
  );

  const messageWordArray = CryptoJS.enc.Utf8.parse(message);

  const encMsg = CryptoJS.AES.encrypt(
    messageWordArray,
    CryptoJS.enc.Hex.parse(block.toString("hex")),
    {
      iv: CryptoJS.enc.Hex.parse(iv.toString("hex")),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7, // 공식 문서 기준 PKCS7 패딩
    }
  );

  return encMsg.toString();
};

service.decrypt = (secureChannel, encryptedMessage) => {
  const { block, iv } = getAESCipher(
    secureChannel.PrivateKey,
    secureChannel.ServerPublicKey
  );
  const decypteKey = CryptoJS.enc.Hex.parse(block.toString("hex"));

  const copt = {
    iv: CryptoJS.enc.Hex.parse(iv.toString("hex")),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  };
  const encMsg = CryptoJS.AES.decrypt(encryptedMessage, decypteKey, copt);

  const decryptedMsg = encMsg.toString(CryptoJS.enc.Utf8);
  return decryptedMsg;
};

service.validatePasswordWithKeyShare = async (
  secureChannel,
  pvencstr,
  devicePassword,
  accessToken
) => {
  try {
    // devicePassword와 pvencstr을 모두 암호화한다.
    const encDevicePassword = service.encrypt(secureChannel, devicePassword);
    const encPvencstr = service.encrypt(secureChannel, pvencstr);

    // --- 상세 디버깅 로그 추가 (문자열로 변경) ---
    logger.info(
      `[AUTH_VALIDATE] Preparing to call 'check/device-password/share'. ` +
        `ChannelID: ${secureChannel.ChannelID}`
    );
    // ---

    const urlStr = `${web3Config.abcWalletBaseUrl}/wapi/v2/mpc/wallets/check/device-password/share`;
    const data = qs.stringify({
      devicePassword: encDevicePassword,
      pvencstr: encPvencstr, // pvencstr도 암호화하여 전송
    });

    const response = await axios.post(urlStr, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`, // 가설 검증을 위해 임시로 주석 처리했던 부분 복구
        "Secure-Channel": secureChannel.ChannelID,
      },
    });

    // API가 성공하고, 응답의 result 필드가 true일 때만 성공
    if (response.data && response.data.result === true) {
      logger.info("Password validation with KeyShare successful.");
      return true;
    }

    logger.warn("Password validation with KeyShare failed:", {
      status: response.status,
      data: response.data,
    });
    return false;
  } catch (error) {
    logger.error(
      "validatePasswordWithKeyShare API call failed:",
      error.response?.data || error.message
    );
    return false; // API 호출 자체가 실패한 경우
  }
};

service.resetPassword = async (email, encryptedPassword, code, channelId) => {
  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/member/user-management/users/initpassword`;

    const formData = qs.stringify({
      username: email,
      password: encryptedPassword,
      code: code,
      serviceid: SERVICE_ID,
    });

    await axios.patch(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Secure-Channel": channelId,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Password Reset failed`);
  }
};

service.changePassword = async (
  email,
  oldEncryptedPassword,
  newEncryptedPassword,
  channelId
) => {
  try {
    const urlStr = `${web3Config.abcWalletBaseUrl}/member/user-management/users/changepassword`;

    const formData = qs.stringify({
      username: email,
      oldpassword: oldEncryptedPassword,
      newpassword: newEncryptedPassword,
      serviceid: SERVICE_ID,
    });

    await axios.patch(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Secure-Channel": channelId,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Change Password failed`);
  }
};

/**
 * ABC Wallet access token을 검증하고 지갑 정보를 조회
 * @param {string} accessToken - ABC Wallet access token
 * @returns {Object} 지갑 정보 { address, publicKey 등 }
 */
const validateAccessTokenAndGetWallet = async (accessToken) => {
  try {
    const response = await axios.get(
      `${web3Config.abcWalletBaseUrl}/api/auth/account`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200 && response.data.success) {
      return {
        address: response.data.data.address,
        // publicKey 등 필요시 추가
      };
    } else {
      throw new Error("Failed to get wallet info from ABC Wallet");
    }
  } catch (error) {
    logger.error("ABC Wallet access token validation error:", error);
    throw new Error("Invalid or expired access token");
  }
};

/**
 * ABC Wallet을 통해 트랜잭션 실행
 * @param {string} accessToken - ABC Wallet access token
 * @param {Object} transactionParams - 트랜잭션 파라미터
 * @returns {Object} 트랜잭션 영수증
 */
const sendTransactionViaABCWallet = async (accessToken, transactionParams) => {
  try {
    const response = await axios.post(
      `${web3Config.abcWalletBaseUrl}/api/v1/transaction/send`,
      {
        ...transactionParams,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200 && response.data.success) {
      return response.data.data.receipt;
    } else {
      throw new Error("Failed to send transaction via ABC Wallet");
    }
  } catch (error) {
    logger.error("ABC Wallet transaction error:", error);
    throw new Error("Transaction failed via ABC Wallet");
  }
};

/**
 * 소셜 로그인 URL 생성 (ABC WaaS V2 사양)
 * @description 백엔드에서 직접 ABC WaaS API를 호출하여 리다이렉트 될 URL을 받아옵니다.
 * @param {string} provider - 소셜 로그인 제공자 (google, naver, kakao, apple, line)
 * @param {string} audience - 대상 서비스 ID (선택사항)
 * @param {string} callbackUrl - 콜백 URL (선택사항)
 * @returns {string} 사용자가 리다이렉트 될 최종 소셜 로그인 URL
 */
service.getSocialLoginUrl = async (provider, audience, callbackUrl) => {
  try {
    const supportedProviders = ["google", "naver", "kakao", "apple", "line"];
    if (!supportedProviders.includes(provider)) {
      throw new Error(
        `지원하지 않는 provider입니다. 지원: ${supportedProviders.join(", ")}`
      );
    }

    const params = new URLSearchParams({
      audience: audience || SERVICE_ID,
    });

    if (callbackUrl) {
      // API 사양에 따라 파라미터 이름을 'url'로 변경
      params.append("url", callbackUrl);
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    // API 사양에 따라 엔드포인트 경로 변경
    const urlStr = `${
      web3Config.abcWalletBaseUrl
    }/auth/auth-service/v2/${provider}/login?${params.toString()}`;

    logger.info(`Requesting social login URL from: ${urlStr}`);

    const response = await axios.get(urlStr, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      maxRedirects: 0, // 302 리다이렉트를 자동으로 따라가지 않도록 설정
      validateStatus: (status) => status === 302, // 302 상태를 성공으로 간주
    });

    // 302 응답의 Location 헤더에서 리다이렉트 URL 반환
    return response.headers.location;
  } catch (error) {
    logger.error("getSocialLoginUrl error:", {
      message: error.message,
      status: error.response?.status,
      headers: error.response?.headers,
      data: error.response?.data,
    });
    // axios가 302를 에러로 처리하는 경우, 여기서 잡아서 처리
    if (error.response?.status === 302) {
      return error.response.headers.location;
    }
    throw new Error(`소셜 로그인 URL 생성 실패: ${error.message}`);
  }
};

/**
 * 소셜 로그인 최종 완료 (ID로 토큰 교환, ABC WaaS V2 사양)
 * @description 콜백으로 받은 ID를 이용해 ABC WaaS로부터 최종 토큰을 발급받습니다. 618 에러(신규 가입) 처리를 포함합니다.
 * @param {string} id - 소셜 로그인 콜백에서 받은 ID
 * @returns {Object} 로그인 결과 (성공 시 토큰, 실패 시 618 에러 정보 등)
 */
service.finalizeSocialLogin = async (id) => {
  try {
    if (!id) {
      throw new Error("ID가 필요합니다.");
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    // API 사양에 따라 엔드포인트 및 요청 방식 변경
    const urlStr = `${web3Config.abcWalletBaseUrl}/auth/auth-service/v2/finalize`;
    const formData = qs.stringify({ id });

    const response = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
    });

    // 성공 응답 포맷에 맞춰 반환
    const { id: userId, email, token } = response.data;
    return {
      success: true,
      id: userId,
      email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expireIn: token.expire_in,
      tokenType: token.token_type,
    };
  } catch (error) {
    logger.error(
      "finalizeSocialLogin error:",
      error.response?.data || error.message
    );

    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data;
      // 618 에러(신규 가입 필요) 처리
      if (errorData?.code === 618) {
        try {
          const registrationInfo = JSON.parse(errorData.msg);
          return {
            success: false,
            code: 618,
            message: "신규 가입이 필요합니다.",
            data: {
              email: registrationInfo.email,
              sixcode: registrationInfo.sixcode,
              token: registrationInfo.token, // 회원가입 후 로그인에 사용할 토큰
              timeout: registrationInfo.timeout,
            },
          };
        } catch (parseError) {
          logger.error("618 에러 메시지 파싱 실패:", parseError);
          throw new Error(
            "신규 가입이 필요하지만, 상세 정보 파싱에 실패했습니다."
          );
        }
      }
      throw new Error(
        errorData?.msg ||
          errorData?.error_description ||
          "소셜 로그인 완료에 실패했습니다."
      );
    }
    throw new Error(`소셜 로그인 완료 중 알 수 없는 오류: ${error.message}`);
  }
};

/**
 * 소셜 인증 토큰으로 로그인 (ABC WaaS V2 사양)
 * @description 618 에러로 회원가입 후, 받은 토큰으로 최종 로그인을 합니다.
 * @param {string} token - 618 에러에서 받은 SNS 인증 토큰
 * @param {string} serviceName - 소셜 로그인 제공자 이름 (kakao, google 등)
 * @param {string} audience - 서비스 ID
 * @returns {Object} 로그인 결과 (accessToken, refreshToken 등)
 */
service.loginWithSocialToken = async (token, serviceName, audience) => {
  try {
    if (!token || !serviceName) {
      throw new Error("SNS 토큰과 서비스 이름은 필수입니다.");
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    const urlStr = `${web3Config.abcWalletBaseUrl}/auth/auth-service/v2/token/login`;

    const formData = qs.stringify({
      token: token,
      service: serviceName,
      audience: audience || SERVICE_ID,
    });

    const response = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
    });

    return {
      success: true,
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expireIn: response.data.expires_in,
      tokenType: response.data.token_type,
      idToken: response.data.id_token,
    };
  } catch (error) {
    logger.error(
      "loginWithSocialToken error:",
      error.response?.data || error.message
    );
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.msg || "SNS 토큰으로 로그인 실패.");
    }
    throw new Error(`SNS 토큰으로 로그인 중 알 수 없는 오류: ${error.message}`);
  }
};

/**
 * 소셜 회원가입
 * @param {Object} userData - 회원가입 데이터
 * @returns {Object} 회원가입 결과
 */
service.socialRegister = async (userData) => {
  try {
    const {
      email,
      code,
      provider,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    } = userData;

    if (!email || !code || !provider) {
      throw new Error("필수값 누락 (email, code, provider)");
    }

    // 지원하는 provider 목록 검증
    const supportedProviders = ["google", "naver", "kakao", "apple", "line"];
    if (!supportedProviders.includes(provider)) {
      throw new Error(
        `지원하지 않는 provider입니다. 지원: ${supportedProviders.join(", ")}`
      );
    }

    // 보안 채널 생성 (WaaS v2/join API는 보안 채널이 필요함)
    const secureChannelRes = await service.createSecureChannel();

    // 동의 항목을 1/0으로 변환
    const toOneZero = (v) => (v === true || v === "true" ? 1 : 0);

    const formDataObj = {
      username: email,
      code: code,
      serviceid: SERVICE_ID,
      socialtype: provider,
      overage: toOneZero(overage),
      agree: toOneZero(agree),
      collect: toOneZero(collect),
      thirdparty: toOneZero(thirdParty), // API 필드명은 thirdparty
      advertise: toOneZero(advertise),
    };

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    const urlStr = `${web3Config.abcWalletBaseUrl}/member/user-management/v2/join`;

    const response = await axios.post(urlStr, qs.stringify(formDataObj), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
        "Secure-Channel": secureChannelRes.ChannelID,
      },
    });

    return response.data;
  } catch (error) {
    logger.error("socialRegister error:", error.response?.data || error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.msg || error.message);
    }
    throw new Error(`소셜 회원가입 실패: ${error.message}`);
  }
};

module.exports = {
  ...service,
  validateAccessTokenAndGetWallet,
  sendTransactionViaABCWallet,
};
