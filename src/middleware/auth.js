const logger = require("../utils/logger.js");

/**
 * Authentication middleware
 * Validates Bearer token from Authorization header
 * Stores token in req.token for use in route handlers
 */
module.exports = function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("No Bearer token provided in Authorization header");
      return res.status(401).json({
        status: "failed",
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      logger.warn("Invalid token format in Authorization header");
      return res.status(401).json({
        status: "failed",
        message: "Invalid token",
      });
    }

    // Store token in request object for use in route handlers
    req.token = token;

    logger.info("Token validated successfully");
    next();
  } catch (error) {
    logger.error("Error in auth middleware:", error);
    return res.status(500).json({
      status: "failed",
      message: "Internal server error during authentication",
    });
  }
};
