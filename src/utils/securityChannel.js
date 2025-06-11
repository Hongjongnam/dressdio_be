const crypto = require("crypto");

/**
 * ABC Wallet API와의 통신을 위한 보안 채널을 생성합니다.
 * @returns {string} 보안 채널 ID
 */
const generateSecurityChannel = () => {
  // 현재 타임스탬프를 밀리초 단위로 가져옵니다
  const timestamp = Date.now();

  // 랜덤 문자열을 생성합니다 (32바이트)
  const randomBytes = crypto.randomBytes(32).toString("hex");

  // 타임스탬프와 랜덤 문자열을 조합하여 보안 채널 ID를 생성합니다
  const securityChannel = `${timestamp}-${randomBytes}`;

  return securityChannel;
};

module.exports = {
  generateSecurityChannel,
};
