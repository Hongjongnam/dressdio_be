const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const logger = require("./utils/logger");
const authRouter = require("./routes/auth/auth.js");
const nftRouter = require("./routes/nft");
const utilsRouter = require("./routes/utils");
const { initializeWeb3 } = require("./config/web3");
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
app.use("/api/utils", utilsRouter);

// Basic route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    status: "error",
    message: "Something went wrong!",
  });
});

// Start server function
const startServer = async () => {
  try {
    // Web3 초기화가 완료될 때까지 기다립니다.
    await initializeWeb3();
    logger.info("✅ Web3 & Contracts initialized successfully.");

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("💥 Failed to start server:", error);
    process.exit(1);
  }
};

// 서버 시작
startServer();
