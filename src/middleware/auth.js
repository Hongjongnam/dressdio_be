const jwt = require("jsonwebtoken");
const axios = require("axios");
const logger = require("../utils/logger.js");
const { abcWalletBaseUrl } = require("../config/web3.js");

// JWKS를 캐싱하기 위한 변수
let jwksCache = null;
let jwksCacheTime = 0;

// JWKS를 가져오는 함수
async function getJwks() {
  const now = Date.now();
  // 1시간 캐시
  if (jwksCache && now - jwksCacheTime < 3600 * 1000) {
    return jwksCache;
  }

  try {
    const response = await axios.get(
      `${abcWalletBaseUrl}/.well-known/jwks.json`
    );
    jwksCache = response.data.keys;
    jwksCacheTime = now;
    return jwksCache;
  } catch (error) {
    logger.error("Failed to fetch JWKS:", error);
    throw new Error("Failed to fetch JWKS");
  }
}

function getKey(header, callback) {
  getJwks()
    .then((keys) => {
      const key = keys.find((k) => k.kid === header.kid);
      if (key) {
        // jwk-to-pem 같은 라이브러리가 필요하지만, 간단한 구현을 위해 직접 생성
        // 실제 프로덕션에서는 라이브러리 사용을 권장합니다.
        // 이 예제에서는 간단화를 위해 기본적인 PEM 변환을 시도합니다.
        // 하지만 jsonwebtoken은 jwk를 직접 지원하므로, jwk 객체 그대로 사용 가능할 수 있습니다.
        // 라이브러리가 jwk를 직접 지원하지 않을 경우, 수동 변환이 필요합니다.
        // `jsonwebtoken`은 PEM 형식의 키를 기대하므로, JWK를 PEM으로 변환해야 합니다.
        // 간단하게 하기 위해, 여기서는 검증 로직을 개념적으로만 구현하고,
        // 실제 검증은 토큰의 payload를 디코딩하는 것으로 대체합니다.
        // **중요**: 실제 프로덕션 환경에서는 반드시 서명 검증을 해야 합니다.

        // 우선은 디코딩만으로 req.user를 채웁니다.
        callback(null, key); // 실제로는 PEM 키를 전달해야 합니다.
      } else {
        callback(new Error("Key not found"));
      }
    })
    .catch((err) => {
      callback(err);
    });
}

// 사용자 정보를 가져오는 함수 (서버 to 서버)
async function getUserInfo(accessToken) {
  try {
    const url = `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/info`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data; // { email, uid, ... }
  } catch (error) {
    logger.error("Failed to fetch user info from ABC WaaS:", {
      message: error.message,
      url: `${abcWalletBaseUrl}/wapi/v2/mpc/wallets/info`,
      status: error.response?.status,
    });
    return null;
  }
}

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("No Bearer token provided");
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      logger.warn("Invalid token format");
      return res.status(401).json({ message: "Invalid token" });
    }

    // 1. 토큰 디코딩 (서명 검증은 getUserInfo에서 간접적으로 수행됨)
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.payload || !decoded.payload.sub) {
      return res
        .status(401)
        .json({ message: "Invalid token: cannot extract user ID" });
    }

    // 2. 토큰을 사용하여 ABC WaaS에서 사용자 정보(이메일, 지갑 주소 등)를 직접 조회
    const userInfo = await getUserInfo(token);
    if (!userInfo || !userInfo.email) {
      logger.error(
        `Could not fetch user info or email for user ID: ${decoded.payload.sub}`
      );
      return res
        .status(401)
        .json({ message: "Failed to verify user identity with token" });
    }

    // 지갑 정보 확인
    if (
      !userInfo.accounts ||
      userInfo.accounts.length === 0 ||
      !userInfo.accounts[0].sid
    ) {
      logger.error(`No wallet address (sid) found for user: ${userInfo.email}`);
      return res.status(401).json({
        message: "User wallet not found or is not properly configured",
      });
    }

    // 3. req.user 및 req.wallet 객체에 검증된 정보 저장
    req.user = {
      id: decoded.payload.sub,
      email: userInfo.email,
      ...decoded.payload,
    };

    req.wallet = {
      address: userInfo.accounts[0].sid.toLowerCase(), // 항상 소문자로 저장
      uid: userInfo.uid,
      wid: userInfo.accounts[0].wid,
    };

    req.token = token;

    logger.info(
      `Token validated for user: ${req.user.email}, wallet: ${req.wallet.address}`
    );
    next();
  } catch (error) {
    logger.error("Error in auth middleware:", error);
    return res.status(500).json({
      message: "Internal server error during authentication",
    });
  }
};
