const service = require("../../services/auth.js");
const walletService = require("../../services/wallet.js");
const mpcWalletService = require("../../services/mpcWallet.js");
const { web3, dpTokenContract } = require("../../config/web3");
const { toLowerCase, stringifyBigInts } = require("../../utils/utils");
const logger = require("../../utils/logger.js");
const ADMINADDRESS = process.env.ADMINADDRESS;

// ============================================================================
// MPC 지갑 데이터 저장소 (메모리 기반, 세션 관리 아님)
// ============================================================================
const walletDataStorage = new Map();

/**
 * 저장된 지갑 데이터 조회 (서명용)
 * @param {string} userId - 사용자 ID
 * @returns {Object|null} 지갑 데이터 또는 null
 */
const getStoredWalletData = (userId) => {
  const stored = walletDataStorage.get(userId);
  if (!stored) return null;

  // 24시간 후 자동 삭제
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  if (Date.now() - stored.timestamp > TWENTY_FOUR_HOURS) {
    walletDataStorage.delete(userId);
    return null;
  }

  return stored.walletData;
};

// 소셜 로그인 처리 함수 (내부 함수)
const processSocialLogin = async (provider, authCode) => {
  try {
    logger.info(`Processing social login for provider: ${provider}`);

    // authCode를 사용해서 실제 소셜 로그인 처리
    const result = await service.finalizeSocialLogin(authCode);

    if (!result.accessToken) {
      throw new Error("Social login failed: no access token");
    }

    // 사용자 정보 추출 (임시로 authCode를 userId로 사용)
    const userId = authCode;
    const userInfo = {
      provider: provider,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };

    return {
      success: true,
      userId: userId,
      userInfo: userInfo,
    };
  } catch (error) {
    logger.error("processSocialLogin error:", error);
    return {
      success: false,
      message: error.message || "Social login processing failed",
    };
  }
};

// 소셜 로그인 + MPC 지갑 생성 통합 플로우
const socialLoginCompleteFlow = async (req, res) => {
  const { provider, authCode, devicePassword } = req.body;

  // 디버깅 로그 추가
  logger.info(
    `[AUTH/SOCIAL_FLOW] Received devicePassword for wallet creation: '${devicePassword}'`
  );

  if (!provider || !authCode || !devicePassword) {
    return res.status(400).json({
      success: false,
      message: "provider, authCode, and devicePassword are required",
    });
  }

  // 1. 소셜 로그인 처리
  const socialLoginResult = await processSocialLogin(provider, authCode);

  if (!socialLoginResult.success) {
    return res.status(400).json(socialLoginResult);
  }

  const { userId, userInfo } = socialLoginResult;

  // 2. MPC 지갑 생성 또는 복구 (userInfo에서 accessToken 사용)
  const walletResult = await mpcWalletService.createOrRecoverWallet(
    userId, // email 대신 userId 사용
    devicePassword,
    userInfo.accessToken
  );

  if (!walletResult.success) {
    return res.status(400).json({
      success: false,
      message: "MPC wallet creation/recovery failed",
      error: walletResult.message,
    });
  }

  // 3. 지갑 데이터 저장 (서명용)
  walletDataStorage.set(userId, {
    walletData: walletResult.walletData,
    timestamp: Date.now(),
  });

  // 4. 통합 응답
  res.json({
    success: true,
    message: "Social login and MPC wallet setup completed",
    data: {
      userId,
      userInfo,
      walletAddress: walletResult.walletData.sid, // sid를 주소로 사용
      hasWallet: true,
    },
  });
};

// 지갑 데이터 삭제
const clearWalletData = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    walletDataStorage.delete(userId);

    res.json({
      success: true,
      message: "Wallet data cleared successfully",
    });
  } catch (error) {
    logger.error("Clear wallet data failed:", error);
    res.status(500).json({
      success: false,
      message: "Clear wallet data failed",
      error: error.message,
    });
  }
};

// ============================================================================
// 기본 인증 API
// ============================================================================

/**
 * @route GET /api/auth/verify-email/:email
 * @desc 이메일 존재 여부 확인
 * @access Public
 */
exports.verifyEmail = async (req, res) => {
  try {
    let email = req.params.email || "";
    let isUserExists = await service.isUserExists(email);
    if (isUserExists) {
      return res
        .status(200)
        .json({ status: "success", message: "User exists" });
    } else {
      return res
        .status(404)
        .json({ status: "failed", message: "User doesn't exist" });
    }
  } catch (err) {
    logger.error(err.message);
    return res.status(404).json({ status: "failed", message: err.message });
  }
};

/**
 * @route GET /api/auth/send-code/:email
 * @desc 이메일 인증 코드 전송
 * @access Public
 */
exports.sendCode = async (req, res) => {
  try {
    let email = req.params.email;
    let lang = req.query.lang;
    let template = req.query.template;
    await service.sendCode(email, lang, template);
    return res
      .status(200)
      .json({ status: "success", message: "Code sent successfully" });
  } catch (err) {
    logger.error("sendCode error:", err.message);
    return res
      .status(500)
      .json({ status: "failed", message: "Problem while sending code" });
  }
};

/**
 * @route POST /api/auth/verify-code/:email
 * @desc 이메일 인증 코드 검증
 * @access Public
 */
exports.verifyCode = async (req, res) => {
  try {
    let email = req.params.email || "";
    let code = req.body.code || "";
    await service.verifyCode(email, code);
    return res
      .status(200)
      .json({ status: "success", message: "Code verification successful" });
  } catch (err) {
    logger.error("verifyCode error:", err.message);
    return res
      .status(400)
      .json({ status: "failed", message: "Code verification failed" });
  }
};

/**
 * @route POST /api/auth/register
 * @desc 사용자 회원가입 (이메일 중복 체크 포함)
 * @access Public
 */
exports.register = async (req, res) => {
  try {
    let email = req.body.email;
    let password = req.body.password;
    let code = req.body.code;
    let overage = req.body.overage ? 1 : 0;
    let agree = req.body.agree ? 1 : 0;
    let collect = req.body.collect ? 1 : 0;
    let thirdParty = req.body.thirdParty ? 1 : 0;
    let advertise = req.body.advertise ? 1 : 0;

    logger.info(`Register attempt for email: ${email}`);

    // 1. 이메일 중복 체크
    try {
      let isUserExists = await service.isUserExists(email);
      if (isUserExists) {
        return res.status(409).json({
          status: "failed",
          message: "이미 존재하는 이메일입니다.",
        });
      }
      logger.info("Email availability check passed");
    } catch (emailCheckError) {
      logger.error("Email check failed:", emailCheckError.message);
      return res.status(500).json({
        status: "failed",
        message: "이메일 중복 체크 중 오류가 발생했습니다.",
      });
    }

    // 2. 인증 코드 검증
    try {
      await service.verifyCode(email, code);
      logger.info("Code verification successful");
    } catch (verifyError) {
      logger.error("Code verification failed:", verifyError.message);
      return res.status(428).json({
        status: "failed",
        message: "Authentication code does not match",
      });
    }

    logger.info("Creating secure channel...");
    const secureChannelRes = await service.createSecureChannel();
    logger.info("Secure channel created successfully");

    logger.info("Encrypting password...");
    const encryptedPassword = service.encrypt(secureChannelRes, password);
    logger.info("Password encrypted successfully");

    logger.info("Calling registerUser service...");
    await service.registerUser({
      email,
      encryptedPassword,
      code,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
      channelId: secureChannelRes.ChannelID,
    });
    logger.info("User registration successful");

    return res
      .status(200)
      .json({ status: "success", message: "User registered successfully" });
  } catch (err) {
    logger.error("Registration error details:", err);
    logger.error("Error stack:", err.stack);
    return res
      .status(500)
      .json({ status: "failed", message: "Problem while registering user" });
  }
};

/**
 * @route POST /api/auth/login
 * @desc 사용자 로그인
 * @access Public
 */
exports.login = async (req, res) => {
  try {
    logger.info("Login attempt", { email: req.body.email });
    let email = req.body.email || "";
    let password = req.body.password || "";

    // devicePassword 제거 - 이메일/비밀번호 로그인에서는 불필요
    let secureChannelRes = await service.createSecureChannel();
    const encryptedPassword = service.encrypt(secureChannelRes, password);
    const loginRes = await service.loginUser(
      email,
      encryptedPassword,
      secureChannelRes.ChannelID
    );

    let walletInfo;
    try {
      const walletResult = await walletService.getWallet(loginRes.accessToken);
      walletInfo = walletResult ? walletResult.address : null;
    } catch (_) {
      // 지갑이 없어도 로그인은 성공
      walletInfo = null;
    }

    let _address = walletInfo ? toLowerCase(walletInfo) : null;

    return res.status(200).json({
      status: "success",
      data: {
        accessToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken,
        expireIn: loginRes.expireIn,
        address: walletInfo,
        isAdmin: walletInfo
          ? toLowerCase(walletInfo) === toLowerCase(ADMINADDRESS)
          : false,
      },
      message: "Login successful",
    });
  } catch (err) {
    logger.error("login error:", err);
    return res.status(401).json({ status: "failed", message: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    let refreshToken = req.body.refreshToken || "";
    const refreshTokenRes = await service.refreshToken(refreshToken);
    return res.status(200).json({
      status: "success",
      data: {
        accessToken: refreshTokenRes.accessToken,
        refreshToken: refreshTokenRes.refreshToken,
        expireIn: refreshTokenRes.expireIn,
      },
      message: "Reissue Accesstoken successful",
    });
  } catch (err) {
    logger.error("refreshToken error:", err);
    return res.status(401).json({ status: "failed", message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    let email = req.body.email || "";
    let password = req.body.password || "";
    let code = req.body.code || "";
    const secureChannelRes = await service.createSecureChannel();
    const encryptedPassword = service.encrypt(secureChannelRes, password);
    await service.resetPassword(
      email,
      encryptedPassword,
      code,
      secureChannelRes.ChannelID
    );
    return res
      .status(200)
      .json({ status: "success", message: "Password Reset successful" });
  } catch (err) {
    logger.error("resetPassword error:", err);
    return res.status(500).json({ status: "failed", message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    let accessToken = req.token; // 헤더에서 accessToken 가져오기
    let oldpassword = req.body.oldpassword || "";
    let newpassword = req.body.newpassword || "";

    // accessToken에서 사용자 정보 조회
    let walletInfo;
    try {
      walletInfo = await walletService.getWallet(accessToken);
    } catch (e) {
      return res.status(401).json({
        status: "failed",
        message: "Invalid accessToken or walletService error",
      });
    }

    if (!walletInfo || !walletInfo.email) {
      return res.status(401).json({
        status: "failed",
        message: "No user email found for accessToken",
      });
    }

    const email = walletInfo.email;
    const secureChannelRes = await service.createSecureChannel();
    const oldEncryptedPassword = service.encrypt(secureChannelRes, oldpassword);
    const newEncryptedPassword = service.encrypt(secureChannelRes, newpassword);

    await service.changePassword(
      email,
      oldEncryptedPassword,
      newEncryptedPassword,
      secureChannelRes.ChannelID
    );
    return res
      .status(200)
      .json({ status: "success", message: "Change Password successful" });
  } catch (err) {
    logger.error("changePassword error:", err);
    return res.status(500).json({ status: "failed", message: err.message });
  }
};

/**
 * @route GET /api/auth/account
 * @desc accessToken을 walletService.getWallet로 조회하여 이메일과 walletAddress 반환
 * @access Protected (auth 미들웨어 필요)
 */
exports.getAccount = async (req, res) => {
  try {
    const accessToken = req.token;
    if (!accessToken) {
      return res
        .status(401)
        .json({ status: "failed", message: "No accessToken provided" });
    }
    // ABC WAAS 방식으로 사용자 정보 조회
    let walletInfo;
    try {
      walletInfo = await walletService.getWallet(accessToken);
    } catch (e) {
      return res.status(401).json({
        status: "failed",
        message: "Invalid accessToken or walletService error",
      });
    }
    if (!walletInfo || (!walletInfo.address && !walletInfo.email)) {
      return res.status(401).json({
        status: "failed",
        message: "No user info found for accessToken",
      });
    }
    return res.json({
      status: "success",
      data: {
        email: walletInfo.email,
        walletAddress: walletInfo.address,
      },
    });
  } catch (err) {
    logger.error("getAccount error:", err);
    return res.status(500).json({ status: "failed", message: err.message });
  }
};

/**
 * @route GET /api/auth/balance
 * @desc 사용자의 DP 토큰 잔액을 조회
 * @access Protected (auth 미들웨어 필요)
 */
exports.getAccountBalance = async (req, res) => {
  try {
    const accessToken = req.token;
    if (!accessToken) {
      return res
        .status(401)
        .json({ status: "failed", message: "No accessToken provided" });
    }

    // ABC WAAS로 지갑 주소 조회
    let walletInfo;
    try {
      walletInfo = await walletService.getWallet(accessToken);
    } catch (e) {
      return res.status(401).json({
        status: "failed",
        message: "Invalid accessToken or walletService error",
      });
    }

    if (!walletInfo || !walletInfo.address) {
      return res.status(401).json({
        status: "failed",
        message: "No wallet address found for accessToken",
      });
    }

    // DP 토큰 잔액 조회
    const balance = await dpTokenContract.methods
      .balanceOf(walletInfo.address)
      .call();
    const formattedBalance = web3.utils.fromWei(balance, "ether");

    const responseData = {
      status: "success",
      data: stringifyBigInts({
        address: walletInfo.address,
        balance: formattedBalance,
        rawBalance: balance,
        symbol: "DP",
      }),
    };

    return res.json(responseData);
  } catch (err) {
    logger.error("getAccountBalance error:", err);
    return res.status(500).json({
      status: "failed",
      message: err.message,
    });
  }
};

// ============================================================================
// 소셜 로그인 API
// ============================================================================

/**
 * @route GET /api/auth/social/login-url
 * @desc 소셜 로그인 URL 조회
 * @access Public
 */
exports.getSocialLoginUrl = async (req, res) => {
  try {
    const { provider, audience, callbackUrl } = req.query;

    if (!provider) {
      return res.status(400).json({
        status: "failed",
        message: "provider는 필수 항목입니다.",
      });
    }

    logger.info(`Social login URL request for provider: ${provider}`);

    const url = await service.getSocialLoginUrl(
      provider,
      audience,
      callbackUrl
    );

    return res.status(200).json({
      status: "success",
      url: url,
      message: "소셜 로그인 URL 조회 성공",
    });
  } catch (err) {
    logger.error("getSocialLoginUrl error:", err.message);
    return res.status(400).json({
      status: "failed",
      message: err.message,
    });
  }
};

/**
 * @route POST /api/auth/social/finalize
 * @desc 소셜 로그인 콜백 처리 (ID로 토큰 교환)
 * @access Public
 */
exports.finalizeSocialLogin = async (req, res) => {
  try {
    // devicePassword 파라미터 제거
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        status: "failed",
        message: "id는 필수 항목입니다.",
      });
    }

    logger.info(`Social login finalize request for id: ${id}`);

    const result = await service.finalizeSocialLogin(id);

    // 성공 또는 618 에러 응답을 그대로 클라이언트에 전달
    if (result.success === false) {
      // 618 에러의 경우
      return res.status(200).json({
        // 에러지만, 정보 전달을 위해 200으로 응답
        status: "needs-registration",
        code: result.code,
        message: result.message,
        data: result.data,
      });
    }

    // 성공한 경우
    return res.status(200).json({
      status: "success",
      data: result,
      message: "소셜 로그인 성공",
    });
  } catch (err) {
    logger.error("finalizeSocialLogin error:", err);
    return res.status(500).json({
      status: "failed",
      message: err.message || "소셜 로그인 완료 중 오류가 발생했습니다.",
    });
  }
};

/**
 * @route POST /api/auth/social/register
 * @desc 소셜 회원가입
 * @access Public
 */
exports.socialRegister = async (req, res) => {
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
    } = req.body;

    if (!email || !code || !provider) {
      return res.status(400).json({
        status: "failed",
        message: "필수값 누락 (email, code, provider)",
      });
    }

    logger.info(
      `Social register attempt for provider: ${provider}, email: ${email}`
    );

    const result = await service.socialRegister({
      email,
      code,
      provider,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    });

    return res.status(200).json({
      status: "success",
      data: result,
      message: "소셜 회원가입 성공",
    });
  } catch (err) {
    logger.error("socialRegister error:", err);
    return res.status(400).json({
      status: "failed",
      message: err.message || "소셜 회원가입 중 오류가 발생했습니다.",
    });
  }
};

/**
 * @route POST /api/auth/social/login-full
 * @desc 소셜 로그인 통합 플로우 (URL 조회부터 시작)
 * @access Public
 */
exports.socialLoginFull = async (req, res) => {
  try {
    const { provider, callbackUrl } = req.body;

    if (!provider) {
      return res.status(400).json({
        status: "failed",
        message: "provider는 필수 항목입니다.",
      });
    }

    logger.info(`Social login full flow for provider: ${provider}`);

    // 소셜 로그인 URL 조회
    const url = await service.getSocialLoginUrl(
      provider,
      undefined,
      callbackUrl
    );

    return res.status(200).json({
      status: "success",
      loginUrl: url,
      instructions:
        "사용자를 loginUrl로 리디렉션하세요. 로그인 완료 후 콜백에서 받은 ?id=... 값을 /api/auth/social/finalize에 POST하여 로그인을 완료하세요.",
      message: "소셜 로그인 URL 조회 성공",
    });
  } catch (err) {
    logger.error("socialLoginFull error:", err);
    return res.status(500).json({
      status: "failed",
      message: err.message || "소셜 로그인 플로우 중 오류가 발생했습니다.",
    });
  }
};

// ============================================================================
// MPC 지갑 API
// ============================================================================

/**
 * @route POST /api/auth/mpc/wallet/create-or-recover
 * @desc MPC 지갑을 생성하거나 복구합니다.
 * @access Protected (auth 미들웨어 필요)
 */
exports.createOrRecoverMpcWallet = async (req, res) => {
  const { devicePassword, email } = req.body;

  // 헤더에서 accessToken 직접 가져오기
  const authHeader = req.headers.authorization;
  const accessToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  // 디버깅 로그 추가
  logger.info(
    `[AUTH/MPC_RECOVER] Received devicePassword for wallet creation: '${devicePassword}'`
  );

  if (!devicePassword || !accessToken || !email) {
    return res.status(400).json({
      success: false,
      message: "devicePassword, accessToken (header), and email are required.",
    });
  }

  try {
    logger.info(`MPC 지갑 생성/복구 요청:`, { email });
    const walletData = await mpcWalletService.createOrRecoverWallet(
      email,
      devicePassword,
      accessToken
    );

    // WaaS API 응답 전체를 클라이언트에 전달
    logger.info(`MPC 지갑 생성/복구 성공:`, {
      uid: walletData.uid,
      wid: walletData.wid,
      sid: walletData.sid,
    });
    res.json({
      success: true,
      message: "MPC Wallet created or recovered successfully.",
      data: walletData, // WaaS 응답 전체를 data 필드에 담아 전달
    });
  } catch (error) {
    logger.error("MPC 지갑 생성/복구 실패:", {
      email: email,
      error: error.message,
      code: error.code,
    });

    // 토큰 만료 에러 처리
    if (error.code === "TOKEN_EXPIRED") {
      return res
        .status(401)
        .json({ success: false, message: "Authentication token has expired." });
    }

    res
      .status(500)
      .json({ success: false, message: "Failed to process MPC wallet." });
  }
};

/**
 * @route POST /api/auth/mpc/wallet/validate
 * @desc 저장된 MPC 지갑 데이터 검증
 * @access Protected (auth 미들웨어 필요)
 */
exports.validateMpcWalletData = async (req, res) => {
  try {
    // 헤더에서 accessToken 직접 가져오기
    const authHeader = req.headers.authorization;
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;
    const { storedWalletData, devicePassword } = req.body;

    // 입력값 검증
    if (!storedWalletData || !devicePassword) {
      return res.status(400).json({
        status: "failed",
        message: "storedWalletData and devicePassword are required",
      });
    }

    // 저장된 지갑 데이터 필수 필드 확인
    const requiredFields = [
      "uid",
      "wid",
      "sid",
      "pvencstr",
      "encryptDevicePassword",
    ];
    const missingFields = requiredFields.filter(
      (field) => !storedWalletData[field]
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: "failed",
        message: `Missing required fields in storedWalletData: ${missingFields.join(
          ", "
        )}`,
      });
    }

    logger.info("MPC 지갑 데이터 검증 요청:", {
      walletAddress: storedWalletData.sid,
      uid: storedWalletData.uid,
      wid: storedWalletData.wid,
    });

    // 지갑 데이터 검증
    const isValid = await mpcWalletService.validateStoredWalletData(
      storedWalletData,
      devicePassword,
      accessToken
    );

    logger.info("MPC 지갑 데이터 검증 결과:", {
      walletAddress: storedWalletData.sid,
      isValid: isValid.result,
    });

    return res.status(200).json({
      status: "success",
      message: "MPC 지갑 데이터 검증 완료",
      data: {
        isValid: isValid.result,
        walletAddress: storedWalletData.sid,
        email: storedWalletData.email,
      },
    });
  } catch (error) {
    logger.error("MPC 지갑 데이터 검증 실패:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      status: "failed",
      message: error.message || "MPC 지갑 데이터 검증 중 오류가 발생했습니다.",
    });
  }
};

// ============================================================================
// 내부 함수 exports
// ============================================================================
exports.socialLoginCompleteFlow = socialLoginCompleteFlow;
exports.clearWalletData = clearWalletData;
