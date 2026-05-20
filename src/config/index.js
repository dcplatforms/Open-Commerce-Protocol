/**
 * Configuration Module
 *
 * Centralized configuration management with environment variable support.
 */

require("dotenv").config();

const config = {
  // Server configuration
  server: {
    nodeEnv: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || "0.0.0.0",
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000",
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || "mongodb://localhost:27017/openwallet",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // Redis configuration (optional)
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    enabled: !!process.env.REDIS_URL,
  },

  // Tokenization provider configuration
  tokenization: {
    apiKey: process.env.TOKENIZATION_API_KEY,
    baseURL: process.env.TOKENIZATION_BASE_URL || "https://api.basistheory.com",
    tenantId: process.env.TOKENIZATION_TENANT_ID,
    timeout: 30000,
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || "change-this-in-production",
    jwtExpiresIn: "7d",
    encryptionKey: process.env.ENCRYPTION_KEY,
    webhookSecret: process.env.WEBHOOK_SECRET,
    bcryptRounds: 10,
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    standardHeaders: true,
    legacyHeaders: false,
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
  },

  // Wallet configuration
  wallet: {
    defaultCurrency: process.env.DEFAULT_CURRENCY || "USD",
    minBalance: parseFloat(process.env.MIN_BALANCE) || 0,
    maxBalance: parseFloat(process.env.MAX_BALANCE) || 10000,
    autoTopUp: {
      enabled: process.env.AUTO_TOPUP_ENABLED === "true",
      threshold: parseFloat(process.env.AUTO_TOPUP_THRESHOLD) || 10,
      amount: parseFloat(process.env.AUTO_TOPUP_AMOUNT) || 50,
    },
  },

  // Payment providers
  applePay: {
    merchantId: process.env.APPLE_PAY_MERCHANT_ID,
    merchantName:
      process.env.APPLE_PAY_MERCHANT_NAME || "Open Commerce Initiative (OCI)",
    countryCode: "US",
    supportedNetworks: ["visa", "mastercard", "amex", "discover"],
  },

  googlePay: {
    merchantId: process.env.GOOGLE_PAY_MERCHANT_ID,
    merchantName:
      process.env.GOOGLE_PAY_MERCHANT_NAME || "Open Commerce Initiative (OCI)",
    environment: process.env.GOOGLE_PAY_ENVIRONMENT || "TEST",
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "logs/app.log",
    console: process.env.NODE_ENV !== "production",
  },

  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN,
    newRelicKey: process.env.NEW_RELIC_LICENSE_KEY,
  },

  // Testing
  testing: {
    testMode: process.env.TEST_MODE === "true",
  },
};

// Validation
function validateConfig() {
  const errors = [];

  if (!config.tokenization.apiKey && config.server.nodeEnv === "production") {
    errors.push("TOKENIZATION_API_KEY is required in production");
  }

  if (
    config.security.jwtSecret === "change-this-in-production" &&
    config.server.nodeEnv === "production"
  ) {
    errors.push("JWT_SECRET must be changed in production");
  }

  if (
    !config.security.encryptionKey &&
    config.server.nodeEnv === "production"
  ) {
    errors.push("ENCRYPTION_KEY is required in production");
  }

  // Database URL is always required
  if (!process.env.DATABASE_URL && config.server.nodeEnv === "production") {
    errors.push("DATABASE_URL is required in production");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }
}

// Validate on load
if (process.env.NODE_ENV !== "test") {
  validateConfig();
}

module.exports = config;
