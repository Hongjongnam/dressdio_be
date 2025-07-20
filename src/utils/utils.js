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
  console.log("[stringifyBigInts] 입력 타입:", typeof obj);

  if (typeof obj === "bigint") {
    console.log("[stringifyBigInts] BigInt 발견:", obj.toString());
    return obj.toString();
  } else if (Array.isArray(obj)) {
    console.log("[stringifyBigInts] 배열 처리:", obj.length);
    return obj.map(stringifyBigInts);
  } else if (obj && typeof obj === "object" && obj !== null) {
    console.log("[stringifyBigInts] 객체 처리:", Object.keys(obj));
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      console.log("[stringifyBigInts] 키:", key, "값 타입:", typeof value);
      result[key] = stringifyBigInts(value);
    }
    return result;
  }

  console.log("[stringifyBigInts] 기본값 반환:", obj);
  return obj;
}

module.exports = {
  toLowerCase,
  stringifyBigInts,
};
