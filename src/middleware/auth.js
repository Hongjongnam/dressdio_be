const logger = require("../utils/logger.js");

/**
 * Authentication middleware
 * Validates Bearer token from Authorization header
 * Stores token in req.token for use in route handlers
 */
module.exports = function (req, res, next) {
  try {
    console.log("Auth middleware - Request headers:", req.headers);
    console.log(
      "Auth middleware - Authorization header:",
      req.headers.authorization
    );

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("No Bearer token provided in Authorization header");
      console.log("Auth middleware - No Bearer token found");
      return res.status(401).json({
        status: "failed",
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log(
      "Auth middleware - Extracted token:",
      token ? token.substring(0, 10) + "..." : "null"
    );

    if (!token) {
      logger.warn("Invalid token format in Authorization header");
      console.log("Auth middleware - Token is empty after extraction");
      return res.status(401).json({
        status: "failed",
        message: "Invalid token",
      });
    }

    // Store token in request object for use in route handlers
    req.token = token;

    logger.info("Token validated successfully");
    console.log("Auth middleware - Token validated successfully");
    next();
  } catch (error) {
    logger.error("Error in auth middleware:", error);
    console.error("Auth middleware - Error:", error);
    return res.status(500).json({
      status: "failed",
      message: "Internal server error during authentication",
    });
  }
};
