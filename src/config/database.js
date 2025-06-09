const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables based on NODE_ENV
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Fallback to .env if specific env file doesn't exist
if (!process.env.DB_NAME) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

// Custom logging function
const customLogger = (msg) => {
  // Only log important messages
  if (msg.includes("Executing") || msg.includes("SELECT 1+1")) {
    return;
  }
  console.log(msg);
};

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? customLogger : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      paranoid: true,
    },
    dialectOptions: {
      dateStrings: true,
      typeCast: true,
      connectTimeout: 60000,
    },
    timezone: "+09:00", // 한국 시간대
    retry: {
      max: 3, // 최대 3번 재시도
    },
  }
);

// Test the connection
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Database connection established");
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    // 연결 실패 시 프로세스 종료
    process.exit(1);
  });

module.exports = sequelize;
