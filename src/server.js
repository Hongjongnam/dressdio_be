const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const sequelize = require("./config/database");
const logger = require("./utils/logger");
const authRouter = require("./routes/auth/auth.js");
const nftRouter = require("./routes/nft");
const blockchainRouter = require("./routes/auth/blockchain.js");
const utilsRouter = require("./routes/utils");
const path = require("path");

// Load environment variables
require("dotenv").config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// 정적 파일 서빙 (public 폴더)
app.use(express.static(path.join(__dirname, "../public")));

// Mount routes
app.use("/api/auth", authRouter);
app.use("/api/nft", nftRouter);
app.use("/api/auth/blockchain", blockchainRouter);
app.use("/api/utils", utilsRouter);

// Initialize database
const initializeDatabase = async () => {
  try {
    await sequelize.authenticate();
    logger.info("Database connection has been established successfully.");

    // alter: true로 변경하여 기존 테이블 구조를 수정
    await sequelize.sync({ alter: true });
    logger.info("Database tables have been synchronized.");
  } catch (error) {
    logger.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to DressDio API" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    status: "error",
    message: "Something went wrong!",
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  await initializeDatabase();
  logger.info(`Server is running on port ${PORT}`);
});
