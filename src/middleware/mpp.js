/**
 * MPP (Machine Payment Protocol) 402 Handler Middleware
 *
 * Enables agents to autonomously handle 'Payment Required' (HTTP 402) flows.
 * If an agent hits a 402, it checks for a valid mandate, generates a cart mandate,
 * and retries the request with the payment header.
 */

const logger = require("../utils/logger");

class MPP402Handler {
  constructor(agentService, mandateService) {
    this.agentService = agentService;
    this.mandateService = mandateService;
  }

  /**
   * Handle an autonomous request that might result in a 402
   * @param {Object} agent - The acting agent
   * @param {Function} requestFn - The function that executes the request
   * @param {string} intentMandateToken - The agent's pre-authorized intent mandate
   */
  async executeAutonomousRequest(agent, requestFn, intentMandateToken) {
    try {
      let response = await requestFn();

      if (response.status === 402) {
        return await this._handle402Response(
          agent,
          response,
          intentMandateToken,
          requestFn,
        );
      }

      return response;
    } catch (error) {
      if (error.response?.status === 402) {
        return await this._handle402Response(
          agent,
          error.response,
          intentMandateToken,
          requestFn,
        );
      }
      throw error;
    }
  }

  /**
   * Handle 402 response and retry
   * @private
   */
  async _handle402Response(agent, response, intentMandateToken, requestFn) {
    logger.info(`MPP: Handling 402 Payment Required for agent ${agent.name}`);

    // 1. Extract payment requirement details from headers or body
    // MPP standard uses headers like 'X-MPP-Amount' and 'X-MPP-Merchant-DID'
    const amount = parseFloat(
      response.headers?.["x-mpp-amount"] || response.data?.amount,
    );
    const currency =
      response.headers?.["x-mpp-currency"] || response.data?.currency || "USD";
    const merchantDid =
      response.headers?.["x-mpp-merchant-did"] || response.data?.merchant_did;
    const cartItems = response.data?.cart_items || [
      { item: "API_CALL", quantity: 1 },
    ];

    if (!amount || !merchantDid) {
      throw new Error(
        "Zero Trust Validation Failed: Incomplete payment requirements in 402 response",
      );
    }

    // 2. Validate Intent Mandate
    const decodedIntent =
      await this.mandateService.verifyMandate(intentMandateToken);

    // Check if the 402 request is within the intent's budget
    if (amount > decodedIntent.max_budget.value) {
      throw new Error(
        `Zero Trust Validation Failed: MPP payment amount ${amount} exceeds intent mandate budget of ${decodedIntent.max_budget.value}`,
      );
    }

    // 3. Generate a Cart Mandate for the specific 402 request
    logger.info(`MPP: Issuing autonomous cart mandate for amount ${amount}`);
    const cartMandateToken = await this.mandateService.issueCartMandate({
      intentMandate: intentMandateToken,
      cartItems,
      totalPrice: amount,
      merchantDid,
    });

    // 4. Retry the request with the Payment Mandate header
    logger.info(`MPP: Retrying request with Cart Mandate...`);
    return await requestFn({
      headers: {
        "X-OCP-Cart-Mandate": cartMandateToken,
        Authorization: `Bearer ${agent.id}`,
      },
    });
  }
}

module.exports = MPP402Handler;
