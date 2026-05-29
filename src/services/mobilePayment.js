/**
 * Mobile Payment Service
 *
 * Handles Apple Pay and Google Pay integration for mobile wallet funding.
 * Processes encrypted payment data and creates secure tokens.
 */

const TokenizationService = require("./tokenization");
const crypto = require("crypto");
const logger = require("../utils/logger");

class MobilePaymentService {
  constructor(tokenizationService, walletService, config = {}) {
    this.tokenization = tokenizationService || new TokenizationService();
    this.wallet = walletService;
    this.config = {
      applePay: {
        merchantId:
          config.applePay?.merchantId || process.env.APPLE_PAY_MERCHANT_ID,
        merchantName:
          config.applePay?.merchantName || "Open Commerce Initiative (OCI)",
        countryCode: config.applePay?.countryCode || "US",
        supportedNetworks: config.applePay?.supportedNetworks || [
          "visa",
          "mastercard",
          "amex",
          "discover",
        ],
      },
      googlePay: {
        merchantId:
          config.googlePay?.merchantId || process.env.GOOGLE_PAY_MERCHANT_ID,
        merchantName:
          config.googlePay?.merchantName || "Open Commerce Initiative (OCI)",
        environment: config.googlePay?.environment || "PRODUCTION",
      },
    };
  }

  /**
   * Initialize Apple Pay session
   * @param {Object} params - Session parameters
   * @param {string} params.walletId - Wallet identifier
   * @param {number} params.amount - Payment amount
   * @param {string} params.currency - Currency code
   * @returns {Promise<Object>} Session data
   */
  async initializeApplePay({ walletId, amount, currency = "USD" }) {
    try {
      // Validate wallet
      const wallet = await this.wallet.getWallet(walletId);
      if (!wallet || wallet.status !== "active") {
        throw new Error("Invalid or inactive wallet");
      }

      // Generate session ID
      const sessionId = this._generateSessionId("applepay");

      // Create payment request configuration
      const paymentRequest = {
        sessionId,
        merchantIdentifier: this.config.applePay.merchantId,
        merchantName: this.config.applePay.merchantName,
        countryCode: this.config.applePay.countryCode,
        currencyCode: currency,
        supportedNetworks: this.config.applePay.supportedNetworks,
        merchantCapabilities: ["supports3DS"],
        total: {
          label: `Add ${amount} ${currency} to wallet`,
          amount: amount.toFixed(2),
          type: "final",
        },
      };

      // Store session temporarily (in production, use Redis or similar)
      await this._storeSession(sessionId, {
        walletId,
        amount,
        currency,
        type: "applepay",
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      });

      return paymentRequest;
    } catch (error) {
      throw this._handleError("initializeApplePay", error);
    }
  }

  /**
   * Process Apple Pay payment
   * @param {Object} params - Payment parameters
   * @param {string} params.sessionId - Session identifier
   * @param {Object} params.paymentData - Apple Pay payment data
   * @returns {Promise<Object>} Payment result
   */
  async processApplePay({ sessionId, paymentData }) {
    try {
      // Retrieve session
      const session = await this._getSession(sessionId);
      if (!session) {
        throw new Error("Invalid or expired session");
      }

      if (session.type !== "applepay") {
        throw new Error("Invalid session type");
      }

      // Validate payment data structure
      this._validateApplePayData(paymentData);

      // Create token from Apple Pay data
      const token = await this.tokenization.createApplePayToken(paymentData, {
        wallet_id: session.walletId,
        session_id: sessionId,
        amount: session.amount,
        currency: session.currency,
      });

      // Add funds to wallet
      const result = await this.wallet.addFunds({
        walletId: session.walletId,
        amount: session.amount,
        paymentToken: token.id,
        description: `Apple Pay funding - ${session.amount} ${session.currency}`,
        metadata: {
          payment_method: "apple_pay",
          payment_network: token.payment_network,
          transaction_id: token.transaction_id,
          session_id: sessionId,
        },
      });

      // Clean up session
      await this._deleteSession(sessionId);

      return {
        success: true,
        transactionId: result.transactionId,
        amount: session.amount,
        currency: session.currency,
        newBalance: result.newBalance,
        token: {
          id: token.id,
          last4: this._extractLast4FromToken(token),
          network: token.payment_network,
        },
      };
    } catch (error) {
      throw this._handleError("processApplePay", error);
    }
  }

  /**
   * Initialize Google Pay session
   * @param {Object} params - Session parameters
   * @param {string} params.walletId - Wallet identifier
   * @param {number} params.amount - Payment amount
   * @param {string} params.currency - Currency code
   * @returns {Promise<Object>} Session data
   */
  async initializeGooglePay({ walletId, amount, currency = "USD" }) {
    try {
      // Validate wallet
      const wallet = await this.wallet.getWallet(walletId);
      if (!wallet || wallet.status !== "active") {
        throw new Error("Invalid or inactive wallet");
      }

      // Generate session ID
      const sessionId = this._generateSessionId("googlepay");

      // Create payment configuration
      const paymentConfig = {
        sessionId,
        environment: this.config.googlePay.environment,
        merchantInfo: {
          merchantId: this.config.googlePay.merchantId,
          merchantName: this.config.googlePay.merchantName,
        },
        transactionInfo: {
          totalPriceStatus: "FINAL",
          totalPrice: amount.toFixed(2),
          currencyCode: currency,
          countryCode: this.config.applePay.countryCode,
        },
        allowedPaymentMethods: [
          {
            type: "CARD",
            parameters: {
              allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
              allowedCardNetworks: ["MASTERCARD", "VISA", "AMEX", "DISCOVER"],
            },
            tokenizationSpecification: {
              type: "PAYMENT_GATEWAY",
              parameters: {
                gateway: "basistheory",
                gatewayMerchantId: this.config.googlePay.merchantId,
              },
            },
          },
        ],
      };

      // Store session
      await this._storeSession(sessionId, {
        walletId,
        amount,
        currency,
        type: "googlepay",
        expiresAt: Date.now() + 15 * 60 * 1000,
      });

      return paymentConfig;
    } catch (error) {
      throw this._handleError("initializeGooglePay", error);
    }
  }

  /**
   * Process Google Pay payment
   * @param {Object} params - Payment parameters
   * @param {string} params.sessionId - Session identifier
   * @param {Object} params.paymentData - Google Pay payment data
   * @returns {Promise<Object>} Payment result
   */
  async processGooglePay({ sessionId, paymentData }) {
    try {
      // Retrieve session
      const session = await this._getSession(sessionId);
      if (!session) {
        throw new Error("Invalid or expired session");
      }

      if (session.type !== "googlepay") {
        throw new Error("Invalid session type");
      }

      // Validate payment data structure
      this._validateGooglePayData(paymentData);

      // Create token from Google Pay data
      const token = await this.tokenization.createGooglePayToken(paymentData, {
        wallet_id: session.walletId,
        session_id: sessionId,
        amount: session.amount,
        currency: session.currency,
      });

      // Add funds to wallet
      const result = await this.wallet.addFunds({
        walletId: session.walletId,
        amount: session.amount,
        paymentToken: token.id,
        description: `Google Pay funding - ${session.amount} ${session.currency}`,
        metadata: {
          payment_method: "google_pay",
          payment_network: token.payment_network,
          session_id: sessionId,
        },
      });

      // Clean up session
      await this._deleteSession(sessionId);

      return {
        success: true,
        transactionId: result.transactionId,
        amount: session.amount,
        currency: session.currency,
        newBalance: result.newBalance,
        token: {
          id: token.id,
          network: token.payment_network,
        },
      };
    } catch (error) {
      throw this._handleError("processGooglePay", error);
    }
  }

  /**
   * Get payment session status
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const session = await this._getSession(sessionId);
      if (!session) {
        return { status: "expired", sessionId };
      }

      const isExpired = Date.now() > session.expiresAt;
      return {
        status: isExpired ? "expired" : "active",
        sessionId,
        type: session.type,
        expiresAt: new Date(session.expiresAt).toISOString(),
      };
    } catch (error) {
      throw this._handleError("getSessionStatus", error);
    }
  }

  /**
   * Cancel a payment session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async cancelSession(sessionId) {
    try {
      await this._deleteSession(sessionId);
    } catch (error) {
      throw this._handleError("cancelSession", error);
    }
  }

  /**
   * Validate Apple Pay payment data structure
   * @private
   */
  _validateApplePayData(paymentData) {
    if (!paymentData || typeof paymentData !== "object") {
      throw new Error("Invalid Apple Pay payment data");
    }

    if (!paymentData.data || !paymentData.signature || !paymentData.version) {
      throw new Error("Missing required Apple Pay payment data fields");
    }

    if (!paymentData.header || !paymentData.header.ephemeralPublicKey) {
      throw new Error("Missing Apple Pay header information");
    }
  }

  /**
   * Validate Google Pay payment data structure
   * @private
   */
  _validateGooglePayData(paymentData) {
    if (!paymentData || typeof paymentData !== "object") {
      throw new Error("Invalid Google Pay payment data");
    }

    if (!paymentData.paymentMethodData) {
      throw new Error("Missing payment method data");
    }

    if (!paymentData.paymentMethodData.tokenizationData) {
      throw new Error("Missing tokenization data");
    }
  }

  /**
   * Generate unique session ID
   * @private
   */
  _generateSessionId(type) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString("hex");
    return `${type}_session_${timestamp}_${random}`;
  }

  /**
   * Store session data (override with Redis/database in production)
   * @private
   */
  async _storeSession(sessionId, data) {
    // In production, use Redis or similar
    // For now, use in-memory storage (not suitable for production)
    if (!this._sessions) {
      this._sessions = new Map();
    }
    this._sessions.set(sessionId, data);
  }

  /**
   * Retrieve session data
   * @private
   */
  async _getSession(sessionId) {
    if (!this._sessions) {
      return null;
    }
    const session = this._sessions.get(sessionId);
    if (session && Date.now() > session.expiresAt) {
      this._sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  /**
   * Delete session data
   * @private
   */
  async _deleteSession(sessionId) {
    if (this._sessions) {
      this._sessions.delete(sessionId);
    }
  }

  /**
   * Extract last 4 digits from token (if available)
   * @private
   */
  _extractLast4FromToken(token) {
    // This would depend on the token structure from your provider
    return token.last4 || "****";
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(method, error) {
    logger.error(`MobilePaymentService.${method} error:`, error);
    return error instanceof Error ? error : new Error(error);
  }
}

module.exports = MobilePaymentService;
