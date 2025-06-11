const winston = require("winston");
const { format } = winston;

// 로그 레벨 정의
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 로그 레벨에 따른 색상 정의
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

// 개발 환경에 따른 로그 레벨 설정
const level = () => {
  const env = process.env.NODE_ENV || "development";
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "warn";
};

// 에러 객체 포맷팅
const errorFormat = format((info) => {
  if (info instanceof Error) {
    return Object.assign({}, info, {
      stack: info.stack,
      message: info.message,
    });
  }
  return info;
});

// 로그 포맷 정의
const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errorFormat(),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// 콘솔 출력 포맷 정의
const consoleFormat = format.combine(
  format.colorize({ all: true }),
  format.printf((info) => {
    const message = info.stack || info.message;
    return `${info.timestamp} ${info.level}: ${message}`;
  })
);

// 로그 필터링 - 불필요한 Sequelize 로그 제외
const filterSequelizeLogs = format((info) => {
  if (
    info.message &&
    (info.message.includes("SELECT 1+1") ||
      info.message.includes("SHOW INDEX") ||
      info.message.includes("SELECT TABLE_NAME"))
  ) {
    return false;
  }
  return info;
})();

// 로거 생성
const logger = winston.createLogger({
  level: level(),
  levels,
  format: format.combine(filterSequelizeLogs, logFormat),
  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // 파일 출력 - 에러 로그
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: logFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
    // 파일 출력 - 모든 로그
    new winston.transports.File({
      filename: "logs/combined.log",
      format: logFormat,
    }),
  ],
  exitOnError: false,
});

// 개발 환경에서만 디버그 로그 활성화
if (process.env.NODE_ENV !== "production") {
  logger.debug("Logging initialized at debug level");
}

module.exports = logger;
