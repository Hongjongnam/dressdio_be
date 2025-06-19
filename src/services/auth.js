console.log("auth.js loaded from:", __filename);
console.log("Current working directory:", process.cwd());
console.log("Trying to require:", require.resolve("../services/auth.js"));

let service = {};
const logger = require("../utils/logger.js");
let axios = require("axios");
let crypto = require("crypto");
let CryptoJS = require("crypto-js");
let qs = require("qs");

const BASE_URL = process.env.BASEURL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SECURE_CHANNEL_MESSAGE = process.env.SECURE_CHANNEL_MESSAGE;
const SERVICE_ID = process.env.SERVICE_ID;

service.isUserExists = async (email) => {
  try {
    const urlStr = `${BASE_URL}/member/user-management/users/${email}?serviceid=${SERVICE_ID}`;
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
    const url = new URL(`${BASE_URL}/member/mail-service/${email}/sendcode`);

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
    const urlStr = `${BASE_URL}/member/mail-service/${email}/verifycode`;
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
    const urlStr = `${BASE_URL}/member/user-management/users/v2/adduser`;
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

    await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
        "Secure-Channel": `${userObj.channelId}`,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.msg);
    }

    throw new Error(`Problem while registering user`);
  }
};

service.loginUser = async (email, encryptedPassword, channelId) => {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  try {
    const urlStr = `${BASE_URL}/auth/auth-service/v2/login`;

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
    const urlStr = `${BASE_URL}/auth/auth-service/v2/refresh`;

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

service.createKeypair = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    privateKey: ecdh,
    publicKey: ecdh,
  };
};

service.getAESCipher = (privateKeyStr, publicKeyStr) => {
  const privateKeyBytes = Buffer.from(privateKeyStr, "hex");
  const publicKeyBytes = Buffer.from(publicKeyStr, "hex");

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privateKeyBytes);
  const sharedSecret = ecdh.computeSecret(publicKeyBytes);

  const key = sharedSecret.slice(0, 16);
  const iv = sharedSecret.slice(16, 32);

  return { block: key, iv: iv };
};

service.createSecureChannel = async () => {
  try {
    const keyPair = service.createKeypair();
    const secureChannelMessage = SECURE_CHANNEL_MESSAGE;

    const formData = qs.stringify({
      pubkey: keyPair.publicKey.getPublicKey("hex"),
      plain: secureChannelMessage,
    });

    const urlStr = `${BASE_URL}/secure/channel/create`;
    const response = await axios.post(urlStr, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to create Secure Channel`);
    }

    const privateKeyStr = keyPair.privateKey.getPrivateKey("hex");

    return {
      ChannelID: response.data.channelid,
      Encrypted: response.data.encrypted,
      ServerPublicKey: response.data.publickey,
      Message: secureChannelMessage,
      PrivateKey: privateKeyStr,
    };
  } catch (error) {
    console.error("create secure channel error:", error);
    throw error;
  }
};

service.encrypt = (secureChannel, message) => {
  const { block, iv } = service.getAESCipher(
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
      padding: CryptoJS.pad.Pkcs7, // Pkcs7 패딩 사용
    }
  );
  return encMsg.toString();
};

service.resetPassword = async (email, encryptedPassword, code, channelId) => {
  try {
    const urlStr = `${BASE_URL}/member/user-management/users/initpassword`;

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
    const urlStr = `${BASE_URL}/member/user-management/users/changepassword`;

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

module.exports = service;
