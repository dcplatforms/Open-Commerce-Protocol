/**
 * Mandate Service (AP2 - Agent Payments Protocol)
 *
 * Handles the issuance, verification, and management of Intent and Cart Mandates.
 * Mandates are cryptographically signed digital contracts that serve as the
 * 'chain of evidence' for autonomous agent transactions.
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const logger = require("../utils/logger");

class MandateService {
  constructor(config = {}) {
    this.issuer = config.issuer || "did:web:open-commerce-protocol.io";
    // In a real implementation, this would be a private key from a secure enclave
    this.signingKey =
      config.signingKey ||
      process.env.MANDATE_SIGNING_KEY ||
      "default-secret-key";
  }

  /**
   * Issue an Intent Mandate
   * @param {Object} params - Mandate parameters
   * @returns {Promise<string>} Signed JWT Mandate
   */
  async issueIntentMandate({
    userDid,
    agentDid,
    maxBudget,
    currency = "USD",
    expiration,
    purposeCode,
    allowedMerchants = [],
  }) {
    const payload = {
      iss: this.issuer,
      sub: agentDid,
      user_did: userDid,
      agent_did: agentDid,
      mandate_id: `mandate_${crypto.randomBytes(8).toString("hex")}`,
      max_budget: {
        value: maxBudget,
        currency,
      },
      exp: expiration || Math.floor(Date.now() / 1000) + 60 * 60 * 24, // Default 24h
      purpose_code: purposeCode,
      allowed_merchants: allowedMerchants,
      iat: Math.floor(Date.now() / 1000),
      type: "intent_mandate",
    };

    return jwt.sign(payload, this.signingKey, { algorithm: "HS256" });
  }

  /**
   * Issue a Cart Mandate linked to an Intent Mandate
   * @param {Object} params - Cart parameters
   * @returns {Promise<string>} Signed JWT Cart Mandate
   */
  async issueCartMandate({
    intentMandate,
    cartItems,
    totalPrice,
    merchantDid,
  }) {
    const decodedIntent = await this.verifyMandate(intentMandate);

    if (decodedIntent.type !== 'intent_mandate') {
      throw new Error('Zero Trust Validation Failed: Invalid intent mandate type');
    }

    // Verify budget
    if (totalPrice > decodedIntent.max_budget.value) {
      throw new Error('Zero Trust Validation Failed: Cart total exceeds intent mandate budget');
    }

    // Verify merchant if whitelist exists
    if (decodedIntent.allowed_merchants.length > 0 && !decodedIntent.allowed_merchants.includes(merchantDid)) {
      throw new Error(`Zero Trust Validation Failed: Merchant ${merchantDid} is not authorized by this mandate`);
    }

    // Create cryptographic hash of cart
    const cartHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ items: cartItems, total: totalPrice }))
      .digest("hex");

    const payload = {
      iss: this.issuer,
      sub: decodedIntent.agent_did,
      intent_mandate_id: decodedIntent.mandate_id,
      cart_hash: cartHash,
      total_price: totalPrice,
      merchant_did: merchantDid,
      iat: Math.floor(Date.now() / 1000),
      exp: decodedIntent.exp, // Inherit expiration from intent
      type: "cart_mandate",
    };

    return jwt.sign(payload, this.signingKey, { algorithm: "HS256" });
  }

  /**
   * Verify a Mandate (Intent or Cart)
   * @param {string} token - Signed JWT Mandate
   * @param {Object} context - Optional context for validation (amount, recipient)
   * @returns {Promise<Object>} Decoded mandate payload
   */
  async verifyMandate(token, context = {}) {
    let decoded;
    try {
      decoded = jwt.verify(token, this.signingKey, { algorithms: ["HS256"] });
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.message?.includes("expired")) {
        throw new Error("Zero Trust Validation Failed: Mandate has expired");
      }
      throw new Error(
        `Zero Trust Validation Failed: Mandate verification failed: ${error.message}`,
      );
    }

    // Contextual Validation
    if (context.amount) {
      if (decoded.max_budget && context.amount > decoded.max_budget.value) {
        throw new Error(
          `Zero Trust Validation Failed: Amount ${context.amount} exceeds mandate budget of ${decoded.max_budget.value}`,
        );
      }
      if (decoded.total_price && context.amount !== decoded.total_price) {
        throw new Error(
          `Zero Trust Validation Failed: Amount ${context.amount} does not match cart mandate total of ${decoded.total_price}`,
        );
      }
    }

    if (context.recipient && decoded.allowed_merchants?.length > 0) {
      if (!decoded.allowed_merchants.includes(context.recipient)) {
        throw new Error(
          `Zero Trust Validation Failed: Merchant ${context.recipient} not authorized by mandate`,
        );
      }
    }

    return decoded;
  }

  /**
   * Issue a Verifiable Credential for an agent
   * @param {Object} params - Agent and user DIDs
   * @returns {Promise<string>} Signed VC
   */
  async issueAgentVC({ userDid, agentDid, capabilities = [] }) {
    const payload = {
      sub: agentDid,
      nbf: Math.floor(Date.now() / 1000),
      vc: {
        "@context": [
          "https://www.w3.org/2018/credentials/v1",
          "https://open-commerce-protocol.io/contexts/agent/v1",
        ],
        type: ["VerifiableCredential", "AgentAuthorityCredential"],
        credentialSubject: {
          id: agentDid,
          authorizedBy: userDid,
          capabilities: capabilities,
        },
      },
    };

    return jwt.sign(payload, this.signingKey, { algorithm: "HS256" });
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(method, error) {
    logger.error(`MandateService.${method} error:`, error);
    return error instanceof Error ? error : new Error(error);
  }
}

module.exports = MandateService;
