const authService = require("../../services/authService");
const logger = require("../../utils/logger");

// 이메일 검증
const verifyEmail = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        status: "failed",
        message: "Email is required",
      });
    }

    const exists = await authService.isUserExists(email);
    return res.status(200).json({
      status: "success",
      message: exists ? "User exists" : "User does not exist",
      data: { exists },
    });
  } catch (error) {
    logger.error(`Email verification error: ${error.message}`);
    return res.status(500).json({
      status: "failed",
      message: "Problem while verifying email",
    });
  }
};

// 인증 코드 전송
const sendCode = async (req, res) => {
  try {
    const { email } = req.params;
    const { lang = "ko", template = "default" } = req.query;

    if (!email) {
      return res.status(400).json({
        status: "failed",
        message: "Email is required",
      });
    }

    logger.info(
      `Sending verification code to ${email} (lang: ${lang}, template: ${template})`
    );
    await authService.sendVerificationCode(email, lang, template);

    return res.status(200).json({
      status: "success",
      message: "Verification code sent successfully",
    });
  } catch (error) {
    logger.error(`Send code error: ${error.message}`, {
      email: req.params.email,
      lang: req.query.lang,
      template: req.query.template,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      status: "failed",
      message: "Failed to send verification code",
    });
  }
};

// 인증 코드 검증
const verifyCodeController = async (req, res) => {
  try {
    const { email } = req.params;
    const { code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        status: "failed",
        message: "Email and code are required",
      });
    }

    await authService.verifyCode(email, code);
    return res.status(200).json({
      status: "success",
      message: "Code verified successfully",
    });
  } catch (error) {
    logger.error(`Code verification error: ${error.message}`);
    return res.status(428).json({
      status: "failed",
      message: "Authentication code does not match",
    });
  }
};

// 회원가입
const register = async (req, res) => {
  try {
    const {
      email,
      password,
      code,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    } = req.body;

    // 요청 데이터 검증
    if (!email || !password || !code) {
      logger.error("Missing required fields:", {
        email: !!email,
        password: !!password,
        code: !!code,
      });
      return res.status(400).json({
        status: "failed",
        message: "Email, password, and code are required",
      });
    }

    // 요청 데이터 로깅 (비밀번호는 마스킹)
    logger.debug("Register request data:", {
      email,
      password: "***",
      code,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    });

    // 1. 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    logger.debug("Secure channel created:", {
      channelId: secureChannelRes.ChannelID,
    });

    // 2. 비밀번호 암호화
    const encryptedPassword = authService.encrypt(
      password,
      secureChannelRes.ChannelID
    );
    logger.debug("Password encrypted successfully");

    // 3. 회원가입 요청
    await authService.registerUser({
      email,
      encryptedPassword,
      code,
      overage: overage ? 1 : 0,
      agree: agree ? 1 : 0,
      collect: collect ? 1 : 0,
      thirdParty: thirdParty ? 1 : 0,
      advertise: advertise ? 1 : 0,
      channelId: secureChannelRes.ChannelID,
    });

    logger.info(`User registered successfully: ${email}`);
    res.json({ status: "success", message: "User registered successfully" });
  } catch (error) {
    logger.error("ABC Wallet API registration failed:", error);
    res.status(500).json({
      status: "failed",
      message: "Failed to register with ABC Wallet",
      error: error.message,
    });
  }
};

// 로그인
const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "failed",
        message: "Email and password are required",
      });
    }

    const { accessToken, refreshToken } = await authService.login(
      email,
      password
    );
    return res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return res.status(401).json({
      status: "failed",
      message: "Invalid credentials",
    });
  }
};

// 토큰 갱신
const refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: "failed",
        message: "Refresh token is required",
      });
    }

    const tokens = await authService.refreshToken(refreshToken);
    return res.status(200).json({
      status: "success",
      message: "Token refreshed successfully",
      data: tokens,
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    return res.status(401).json({
      status: "failed",
      message: "Invalid refresh token",
    });
  }
};

module.exports = {
  verifyEmail,
  sendCode,
  verifyCodeController,
  register,
  loginController,
  refreshTokenController,
};
