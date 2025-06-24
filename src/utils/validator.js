const { CREATOR_TYPES } = require("./constants");

/**
 * 지갑 주소 형식 검증
 * @param {string} address - 검증할 지갑 주소
 * @returns {boolean} 유효한 주소인지 여부
 */
const validateWalletAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * 크리에이터 타입 검증
 * @param {string} type - 검증할 크리에이터 타입
 * @returns {boolean} 유효한 타입인지 여부
 */
const validateCreatorType = (type) => {
  const normalizedType = type.toLowerCase();
  return Object.values(CREATOR_TYPES).includes(normalizedType);
};

/**
 * 이메일 형식 검증
 * @param {string} email - 검증할 이메일
 * @returns {boolean} 유효한 이메일인지 여부
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 비밀번호 강도 검증
 * @param {string} password - 검증할 비밀번호
 * @returns {boolean} 강력한 비밀번호인지 여부
 */
const validatePassword = (password) => {
  // 최소 8자, 영문/숫자/특수문자 포함
  const passwordRegex =
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * 트랜잭션 해시 형식 검증
 * @param {string} hash - 검증할 트랜잭션 해시
 * @returns {boolean} 유효한 해시인지 여부
 */
const validateTransactionHash = (hash) => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

module.exports = {
  validateWalletAddress,
  validateCreatorType,
  validateEmail,
  validatePassword,
  validateTransactionHash,
};
