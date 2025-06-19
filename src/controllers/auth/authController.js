const service = require("../../services/auth.js");
const walletService = require("../../services/wallet.js");
const DEVICE_PASSWORD = process.env.DEVICE_PASSWORD;
const { ethers } = require("ethers");
const toLowerCase = require("../../utils/utils");
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
    try {
      await service.verifyCode(email, code);
    } catch (_) {
      return res.status(428).json({
        status: "failed",
        message: "Authentication code does not match",
      });
    }
    const secureChannelRes = await service.createSecureChannel();
    const encryptedPassword = service.encrypt(secureChannelRes, password);
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
    return res
      .status(200)
      .json({ status: "success", message: "User registered successfully" });
  } catch (err) {
    logger.error(err.message);
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
    let email = req.body.email || "";
    let oldpassword = req.body.oldpassword || "";
    let newpassword = req.body.newpassword || "";
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
