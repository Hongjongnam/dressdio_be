const service = require("../../services/auth.js");
const walletService = require("../../services/wallet.js");
const { web3, dpTokenContract } = require("../../config/web3");
const DEVICE_PASSWORD = process.env.DEVICE_PASSWORD;
const { ethers } = require("ethers");
const { toLowerCase, stringifyBigInts } = require("../../utils/utils");
const logger = require("../../utils/logger.js");
const ADMINADDRESS = process.env.ADMINADDRESS;

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
    logger.error(err.message);
    return res
      .status(404)
      .json({ status: "failed", message: "Problem while sending code" });
  }
};

exports.verifyCode = async (req, res) => {
  try {
    let email = req.params.email || "";
    let code = req.body.code || "";
    await service.verifyCode(email, code);
    return res
      .status(200)
      .json({ status: "success", message: "Code verification successful" });
  } catch (err) {
    logger.error(err.message);
    return res
      .status(404)
      .json({ status: "failed", message: "Code verification failed" });
  }
};

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
    logger.info(`Code verification: ${code}`);
    logger.info(
      `Agreements: overage=${overage}, agree=${agree}, collect=${collect}, thirdParty=${thirdParty}, advertise=${advertise}`
    );

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
      .status(404)
      .json({ status: "failed", message: "Problem while registering user" });
  }
};

exports.login = async (req, res) => {
  try {
    console.log("login", req.body);
    let email = req.body.email || "";
    let password = req.body.password || "";
    let secureChannelRes = await service.createSecureChannel();
    const encryptedPassword = service.encrypt(secureChannelRes, password);
    const loginRes = await service.loginUser(
      email,
      encryptedPassword,
      secureChannelRes.ChannelID
    );
    let walletInfo;
    try {
      walletInfo = (await walletService.getWallet(loginRes.accessToken))
        .address;
    } catch (_) {}
    if (!walletInfo) {
      const encryptedDevicePassword = service.encrypt(
        secureChannelRes,
        DEVICE_PASSWORD
      );
      try {
        walletInfo = (
          await walletService.createWallet(
            email,
            encryptedDevicePassword,
            secureChannelRes.ChannelID,
            loginRes.accessToken
          )
        ).sid;
      } catch (_) {}
    }
    let _address = toLowerCase(walletInfo);
    let account = null; // DB 체크 생략
    let notificationSettings = null; // DB 체크 생략
    return res.status(200).json({
      status: "success",
      data: {
        accessToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken,
        expireIn: loginRes.expireIn,
        address: walletInfo,
        isAdmin: toLowerCase(walletInfo) === toLowerCase(ADMINADDRESS),
      },
      message: "Login successful",
    });
  } catch (err) {
    logger.error(err);
    return res.status(404).json({ status: "failed", message: err.message });
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
    logger.error(err);
    return res.status(404).json({ status: "failed", message: err.message });
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
    logger.error(err);
    return res.status(404).json({ status: "failed", message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    let accessToken = req.body.accessToken || "";
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
    logger.error(err);
    return res.status(404).json({ status: "failed", message: err.message });
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
