const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("../utils/logger");

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

// Database configuration
const dbConfig = {
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: "mysql",
  logging: false,
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
};

// Create Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

// Test the connection
sequelize
  .authenticate()
  .then(() => {
    logger.info("Database connection has been established successfully.");
  })
  .catch((err) => {
    logger.error("Unable to connect to the database:", err);
    // 연결 실패 시 프로세스 종료
    process.exit(1);
  });

// Create necessary indexes
const createIndexes = async () => {
  const indexes = [
    { name: "idx_owner", table: "sbts", column: "owner" },
    { name: "idx_creator_type", table: "sbts", column: "creator_type" },
    { name: "idx_token_id", table: "sbts", column: "token_id" },
  ];

  for (const index of indexes) {
    try {
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.column})`
      );
    } catch (error) {
      logger.warn(`Failed to create index ${index.name}:`, error.message);
    }
  }
  logger.info("Database indexes have been verified.");
};

// Database initialization function
const initDatabase = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info("Database connection has been established successfully.");

    // Sync database schema
    await sequelize.sync({ alter: false });
    logger.info("Database tables have been synchronized.");

    // Create indexes
    await createIndexes();
  } catch (error) {
    logger.error("Database initialization failed:", error);
    throw error;
  }
};

// Initialize database if this file is run directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      logger.info("Database initialization completed successfully.");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Database initialization failed:", error);
      process.exit(1);
    });
}

// Sequelize 인스턴스를 직접 내보내기
module.exports = sequelize;
