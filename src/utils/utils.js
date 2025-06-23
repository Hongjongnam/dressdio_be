const toLowerCase = (val) => {
  if (val) return val.toLowerCase();
  else return val;
};

/**
 * BigInt를 문자열로 변환하는 유틸리티 함수
 * @param {*} obj - 변환할 객체 또는 값
 * @returns {*} BigInt가 문자열로 변환된 객체 또는 값
 */
function stringifyBigInts(obj) {
  if (typeof obj === "bigint") {
    return obj.toString();
  } else if (Array.isArray(obj)) {
    return obj.map(stringifyBigInts);
  } else if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, stringifyBigInts(v)])
    );
  }
  return obj;
}

module.exports = {
  toLowerCase,
  stringifyBigInts,
};
