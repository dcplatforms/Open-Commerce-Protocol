/**
 * Agent Service
 *
 * Manages autonomous agents, their identities, and policy orchestration within the OCP.
 * Facilitates agent-to-agent interactions and ensures policy compliance.
 */

const crypto = require("crypto");
const MandateService = require("./mandate");
const logger = require("../utils/logger");

class AgentService {
  constructor(database, config = {}) {
    this.db = database;
    this.config = {
      defaultSpendingLimit: config.defaultSpendingLimit || 1000,
      defaultAuthorizedCounterparties:
        config.defaultAuthorizedCounterparties || [],
    };
    this.mandateService = new MandateService(config.mandateConfig);
  }

  /**
   * Register a new agent
   * @param {Object} params - Agent registration parameters
   * @param {string} params.name - Agent's name
   * @param {string} params.ownerId - Owner's identifier
   * @param {string} params.walletId - Associated wallet identifier
   * @param {Object} params.policy - Agent's policy (spending limits, counterparties)
   * @returns {Promise<Object>} Registered agent
   */
  async registerAgent({
    name,
    ownerId,
    walletId,
    type = "personal",
    config: agentConfig,
  }) {
    try {
      const newAgent = await this.db.createAgent({
        name,
        ownerId,
        walletId,
        type,
        status: "active",
        config: {
          limits: {
            daily: agentConfig?.limits?.daily || 0,
            perTransaction:
              agentConfig?.limits?.perTransaction ||
              this.config.defaultSpendingLimit,
          },
          authorizedCounterparties:
            agentConfig?.authorizedCounterparties ||
            this.config.defaultAuthorizedCounterparties,
          autoApprove: agentConfig?.autoApprove || false,
        },
        metadata: {},
      });
      return newAgent;
    } catch (error) {
      throw this._handleError("registerAgent", error);
    }
  }

  /**
   * Get an agent by ID
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} Agent object
   */
  async getAgent(agentId) {
    try {
      const agent = await this.db.findAgentById(agentId);
      if (!agent) {
        throw new Error("Agent not found");
      }
      return agent;
    } catch (error) {
      throw this._handleError("getAgent", error);
    }
  }

  /**
   * Get all registered agents
   * @returns {Promise<Array>} List of agent objects
   */
  async getAllAgents(filter = {}) {
    try {
      return await this.db.findAllAgents(filter);
    } catch (error) {
      throw this._handleError("getAllAgents", error);
    }
  }

  /**
   * Update an agent's policy
   * @param {string} agentId - Agent identifier
   * @param {Object} newConfig - New configuration details
   * @returns {Promise<Object>} Updated agent object
   */
  async updateAgentPolicy(agentId, newConfig) {
    try {
      const agent = await this.getAgent(agentId);
      const updatedAgent = await this.db.updateAgent(agentId, {
        config: {
          ...agent.config,
          ...newConfig,
        },
        updatedAt: new Date(),
      });
      return updatedAgent;
    } catch (error) {
      throw this._handleError("updateAgentPolicy", error);
    }
  }

  /**
   * Issue an Intent Mandate for an agent
   * @param {Object} params - Intent parameters
   */
  async issueIntentMandate({
    userDid,
    agentId,
    maxBudget,
    currency,
    expiration,
    purposeCode,
    allowedMerchants,
  }) {
    try {
      const agent = await this.getAgent(agentId);
      const agentDid = agent.metadata?.get("did") || `did:key:${agentId}`;

      return await this.mandateService.issueIntentMandate({
        userDid,
        agentDid,
        maxBudget,
        currency,
        expiration,
        purposeCode,
        allowedMerchants,
      });
    } catch (error) {
      throw this._handleError("issueIntentMandate", error);
    }
  }

  /**
   * Issue a Verifiable Credential for an agent
   */
  async issueAgentVC({ userDid, agentId, capabilities }) {
    try {
      const agent = await this.getAgent(agentId);
      const agentDid = agent.metadata?.get("did") || `did:key:${agentId}`;

      return await this.mandateService.issueAgentVC({
        userDid,
        agentDid,
        capabilities,
      });
    } catch (error) {
      throw this._handleError("issueAgentVC", error);
    }
  }

  /**
   * Perform an Agent-to-Agent (A2A) transfer (conceptual)
   * @param {Object} params - Transfer parameters
   * @param {string} params.fromAgentId - Source agent ID
   * @param {string} params.toAgentId - Destination agent ID
   * @param {number} params.amount - Amount to transfer
   * @param {string} params.currency - Currency code
   * @returns {Promise<Object>} Transfer result
   */
  async performA2ATransfer({ fromAgentId, toAgentId, amount, currency }) {
    // This is a conceptual implementation.
    // In a real system, this would involve interaction with the WalletService,
    // and policy checks for both agents.
    const fromAgent = await this.getAgent(fromAgentId);
    const toAgent = await this.getAgent(toAgentId);

    // Basic policy checks (more complex logic would be here)
    if (amount > fromAgent.policy.spendingLimit) {
      throw new Error(
        `Zero Trust Validation Failed: Transfer amount exceeds spending limit for agent ${fromAgentId}`,
      );
    }
    if (
      !fromAgent.policy.authorizedCounterparties.includes(toAgentId) &&
      fromAgent.policy.authorizedCounterparties.length > 0
    ) {
      throw new Error(
        `Zero Trust Validation Failed: Agent ${toAgentId} is not an authorized counterparty for ${fromAgentId}`,
      );
    }

    // Simulate transfer success
    return {
      success: true,
      fromAgentId,
      toAgentId,
      amount,
      currency,
      timestamp: new Date(),
    };
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(method, error) {
    logger.error(`AgentService.${method} error:`, error);
    return error instanceof Error ? error : new Error(error);
  }
}

module.exports = AgentService;
