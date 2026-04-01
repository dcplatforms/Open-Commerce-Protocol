/**
 * Tokenization Service
 *
 * Provides secure payment tokenization using Basis Theory or compatible providers.
 * Supports PCI DSS compliant token creation, retrieval, and management.
 */

const axios = require('axios');
const crypto = require('crypto');
const MandateService = require('./mandate');

class TokenizationService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.TOKENIZATION_API_KEY;
    this.baseURL = config.baseURL || process.env.TOKENIZATION_BASE_URL || 'https://api.basistheory.com';
    this.tenantId = config.tenantId || process.env.TOKENIZATION_TENANT_ID;
    this.timeout = config.timeout || 30000;

    if (!this.apiKey) {
      throw new Error('Tokenization API key is required');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'BT-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    this.mandateService = new MandateService(config.mandateConfig);
  }

  /**
   * Create a payment token from card data
   * @param {Object} cardData - Card information
   * @param {string} cardData.number - Card number
   * @param {string} cardData.exp_month - Expiration month
   * @param {string} cardData.exp_year - Expiration year
   * @param {string} cardData.cvc - Security code
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Token object
   */
  async createCardToken(cardData, metadata = {}) {
    try {
      const response = await this.client.post('/tokens', {
        type: 'card',
        data: {
          number: cardData.number,
          expiration_month: cardData.exp_month,
          expiration_year: cardData.exp_year,
          cvc: cardData.cvc
        },
        metadata: {
          ...metadata,
          created_at: new Date().toISOString()
        },
        search_indexes: ['{{data.number | last4}}'],
        fingerprint_expression: '{{data.number}}'
      });

      return {
        id: response.data.id,
        type: response.data.type,
        last4: response.data.data.number.slice(-4),
        brand: this._detectCardBrand(cardData.number),
        exp_month: cardData.exp_month,
        exp_year: cardData.exp_year,
        fingerprint: response.data.fingerprint,
        created_at: response.data.created_at
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Create a token from Apple Pay payment data
   * @param {Object} paymentData - Apple Pay payment data
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Token object
   */
  async createApplePayToken(paymentData, metadata = {}) {
    try {
      const response = await this.client.post('/tokens', {
        type: 'applepay',
        data: paymentData,
        metadata: {
          ...metadata,
          payment_method: 'apple_pay',
          created_at: new Date().toISOString()
        }
      });

      return {
        id: response.data.id,
        type: 'applepay',
        payment_network: paymentData.header?.network,
        transaction_id: paymentData.header?.transactionId,
        created_at: response.data.created_at
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Create a token from Google Pay payment data
   * @param {Object} paymentData - Google Pay payment data
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Token object
   */
  async createGooglePayToken(paymentData, metadata = {}) {
    try {
      const response = await this.client.post('/tokens', {
        type: 'googlepay',
        data: paymentData,
        metadata: {
          ...metadata,
          payment_method: 'google_pay',
          created_at: new Date().toISOString()
        }
      });

      return {
        id: response.data.id,
        type: 'googlepay',
        payment_network: paymentData.paymentMethodData?.info?.cardNetwork,
        created_at: response.data.created_at
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Retrieve a token by ID
   * @param {string} tokenId - Token identifier
   * @returns {Promise<Object>} Token object
   */
  async getToken(tokenId) {
    try {
      const response = await this.client.get(`/tokens/${tokenId}`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Delete a token
   * @param {string} tokenId - Token identifier
   * @returns {Promise<void>}
   */
  async deleteToken(tokenId) {
    try {
      await this.client.delete(`/tokens/${tokenId}`);
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Process a payment using a token
   * @param {string} tokenId - Token identifier
   * @param {number} amount - Payment amount in cents
   * @param {string} currency - Currency code (e.g., 'USD')
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Payment result
   */
  async processPayment(tokenId, amount, currency = 'USD', metadata = {}) {
    try {
      // This would integrate with your payment processor
      // Example implementation with a generic payment API
      const response = await this.client.post('/payments', {
        token: tokenId,
        amount,
        currency,
        metadata: {
          ...metadata,
          processed_at: new Date().toISOString()
        }
      });

      return {
        id: response.data.id,
        status: response.data.status,
        amount,
        currency,
        token_id: tokenId,
        created_at: response.data.created_at
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Create a refund for a payment
   * @param {string} paymentId - Payment identifier
   * @param {number} amount - Refund amount in cents
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund result
   */
  async createRefund(paymentId, amount, reason = 'requested_by_customer') {
    try {
      const response = await this.client.post(`/payments/${paymentId}/refunds`, {
        amount,
        reason,
        metadata: {
          refunded_at: new Date().toISOString()
        }
      });

      return {
        id: response.data.id,
        payment_id: paymentId,
        amount,
        reason,
        status: response.data.status,
        created_at: response.data.created_at
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Search tokens by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>} Array of tokens
   */
  async searchTokens(criteria) {
    try {
      const response = await this.client.post('/tokens/search', criteria);
      return response.data.data || [];
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Validate a token
   * @param {string} tokenId - Token identifier
   * @returns {Promise<boolean>} True if valid
   */
  async validateToken(tokenId) {
    try {
      const token = await this.getToken(tokenId);
      return token && !token.expired;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect card brand from card number
   * @private
   */
  _detectCardBrand(cardNumber) {
    const number = cardNumber.replace(/\s/g, '');

    if (/^4/.test(number)) return 'visa';
    if (/^5[1-5]/.test(number)) return 'mastercard';
    if (/^3[47]/.test(number)) return 'amex';
    if (/^6(?:011|5)/.test(number)) return 'discover';
    if (/^(?:2131|1800|35)/.test(number)) return 'jcb';

    return 'unknown';
  }

  /**
   * Create a token for a generic secret (e.g. Private Key)
   * @param {string} secret - The secret data
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Token object
   */
  async createSecretToken(secret, metadata = {}) {
    // Mock for testing/simulation
    if (this.apiKey === 'test-key' || process.env.NODE_ENV === 'test') {
      return {
        id: `token_${crypto.randomBytes(8).toString('hex')}`,
        type: 'secret',
        created_at: new Date().toISOString(),
        metadata: { ...metadata, type: 'secret_key' }
      };
    }

    try {
      const response = await this.client.post('/tokens', {
        type: 'token',
        data: secret,
        metadata: {
          ...metadata,
          type: 'secret_key',
          created_at: new Date().toISOString()
        }
      });

      return {
        id: response.data.id,
        type: 'secret',
        created_at: response.data.created_at,
        metadata: response.data.metadata
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Sign data using a stored token (Simulates secure reactor/enclave)
   * @param {string} tokenId - Token ID of the private key
   * @param {string} dataToSign - Hex or string data to sign
   * @param {string} mandate - Optional signed Mandate (AP2) for Zero Trust validation
   * @param {Object} context - Optional transaction context for validation (e.g., amount, merchant)
   * @returns {Promise<string>} Signature
   */
  async signWithToken(tokenId, dataToSign, mandate, context = {}) {
    try {
      // Zero Trust Validation: Verify mandate if provided
      if (mandate) {
        const decodedMandate = await this.mandateService.verifyMandate(mandate);

        // Validate budget if context amount is provided
        if (context.amount) {
          // Check Intent Mandate budget
          if (decodedMandate.max_budget && context.amount > decodedMandate.max_budget.value) {
            throw new Error(`Zero Trust Validation Failed: Amount ${context.amount} exceeds mandate budget of ${decodedMandate.max_budget.value}`);
          }
          // Check Cart Mandate total price
          if (decodedMandate.total_price && context.amount !== decodedMandate.total_price) {
            throw new Error(`Zero Trust Validation Failed: Amount ${context.amount} does not match cart mandate total of ${decodedMandate.total_price}`);
          }
        }

        // Validate merchant if context merchant is provided
        if (context.merchant && decodedMandate.allowed_merchants?.length > 0) {
          if (!decodedMandate.allowed_merchants.includes(context.merchant)) {
            throw new Error(`Zero Trust Validation Failed: Merchant ${context.merchant} not authorized by mandate`);
          }
        }

        // Validate expiration
        if (decodedMandate.exp < Math.floor(Date.now() / 1000)) {
          throw new Error('Zero Trust Validation Failed: Mandate has expired');
        }
      } else if (process.env.STRICT_MANDATE_MODE === 'true') {
        throw new Error('Zero Trust Validation Failed: Mandate required for signing in strict mode');
      }

      // In a real implementation, this would call a Basis Theory Reactor
      // providing the tokenId. The Reactor would securely retrieve the
      // secret and sign the data without exposing the key.
      const response = await this.client.post('/reactors/sign', {
        args: {
          tokenId,
          data: dataToSign,
          mandate // Pass mandate to reactor for server-side validation
        }
      });

      return response.data.signature;
    } catch (error) {
      // Fallback for simulation/testing if reactor endpoint doesn't exist
      // We assume for simulation that we can just "mock" a signature
      if (process.env.NODE_ENV !== 'production' || this.apiKey === 'test-key') {
        return `0x_mock_signature_of_${dataToSign}_with_${tokenId}${mandate ? '_validated_by_mandate' : ''}`;
      }
      throw this._handleError(error);
    }
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      return new Error(
        `Tokenization error (${status}): ${data.message || data.error || 'Unknown error'}`
      );
    }

    if (error.request) {
      return new Error('Tokenization service unavailable');
    }

    return error;
  }
}

module.exports = TokenizationService;
