const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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

async function initDatabase() {
  try {
    // 모델을 반드시 import한 뒤에 sync 해야 함!
    require("../models/sbt");

    // 프로덕션 환경에서는 force: false로 설정
    const syncOptions = {
      force: process.env.NODE_ENV === "development",
      alter: process.env.NODE_ENV === "production", // 프로덕션에서는 alter: true로 설정
    };

    await sequelize.sync(syncOptions);
    console.log("✅ Database synchronized successfully");

    // 인덱스 생성 (이미 존재하는 경우 무시)
    try {
      await sequelize.query(
        "CREATE INDEX IF NOT EXISTS idx_owner ON sbts(owner)"
      );
      await sequelize.query(
        "CREATE INDEX IF NOT EXISTS idx_creator_type ON sbts(creator_type)"
      );
      await sequelize.query(
        "CREATE INDEX IF NOT EXISTS idx_token_id ON sbts(token_id)"
      );
      console.log("✅ Indexes created/verified successfully");
    } catch (indexError) {
      console.log(
        "ℹ️ Indexes already exist or could not be created:",
        indexError.message
      );
    }
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

module.exports = sequelize;
module.exports.initDatabase = initDatabase;

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
