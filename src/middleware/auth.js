/**
 * Authentication Middleware
 *
 * Validates JWT tokens and protects routes.
 */

const jwt = require("jsonwebtoken");
const config = require("../config");
const logger = require("../utils/logger");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.security.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn("Invalid token attempt:", error.message);
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === "string") {
    roles = [roles];
  }

  return (req, res, next) => {
    if (roles.length && !roles.some((role) => req.user.roles.includes(role))) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
};
