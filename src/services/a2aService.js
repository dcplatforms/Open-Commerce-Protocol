/**
 * A2A Service (Agent-to-Agent)
 *
 * Handles autonomous commerce transactions between AI agents, ensuring
 * policy compliance, limit checks, and authorized counterparty validation.
 */

const { Agent } = require('../models/agent');
const logger = require('../utils/logger');

class A2AService {
    constructor(walletService, db) {
        this.walletService = walletService;
        this.db = db;
    }

    /**
     * Execute a transfer between two agents
     * @param {Object} params
     * @param {string} params.fromAgentId - Sender Agent ID
     * @param {string} params.toAgentId - Recipient Agent ID
     * @param {number} params.amount - Amount to transfer
     * @param {Object} params.ucpPayload - The original UCP intent/payload
     */
    async executeTransfer({ fromAgentId, toAgentId, amount, ucpPayload = {} }) {
        try {
            // 1. Validate Agents
            const fromAgent = await Agent.findById(fromAgentId);
            if (!fromAgent || fromAgent.status !== 'active') {
                throw new Error(`Sender agent ${fromAgentId} not found or inactive`);
            }

            const toAgent = await Agent.findById(toAgentId);
            if (!toAgent || toAgent.status !== 'active') {
                throw new Error(`Recipient agent ${toAgentId} not found or inactive`);
            }

            // 2. Policy Checks (Sender)
            await this._validateAgentPolicy(fromAgent, toAgentId, amount);

            // 3. Execute Wallet Transfer
            const transferResult = await this.walletService.transfer({
                fromWalletId: fromAgent.walletId,
                toWalletId: toAgent.walletId,
                amount,
                description: `A2A Transfer: ${fromAgent.name} -> ${toAgent.name}`,
                metadata: { // Pass metadata for Transaction creation
                    agentId: fromAgentId,
                    counterpartyAgentId: toAgentId,
                    ucpPayload,
                    type: 'a2a_transfer'
                }
            });

            // 4. Update Agent Usage (if we were tracking daily usage in db, we'd do it here)
            // For now, limits are stateless checks against config.
            // In a real implementation, we would query daily volume or update a usage record.

            return {
                success: true,
                transferId: transferResult.transferId,
                timestamp: new Date(),
                fromAgent: fromAgent.name,
                toAgent: toAgent.name,
                amount
            };
        } catch (error) {
            throw this._handleError('executeTransfer', error);
        }
    }

    /**
     * Validate agent policies
     * @private
     */
    async _validateAgentPolicy(agent, counterpartyId, amount) {
        const { config } = agent;
        if (!config) return;

        // Check Per Transaction Limit
        if (config.limits?.perTransaction > 0 && amount > config.limits.perTransaction) {
            throw new Error(`Amount ${amount} exceeds agent per-transaction limit of ${config.limits.perTransaction}`);
        }

        // Check Authorized Counterparties
        if (config.authorizedCounterparties && config.authorizedCounterparties.length > 0) {
            if (!config.authorizedCounterparties.includes(counterpartyId)) {
                throw new Error(`Agent ${agent.id} is not authorized to trade with ${counterpartyId}`);
            }
        }
    }

    /**
     * Handle and format errors
     * @private
     */
    _handleError(method, error) {
        logger.error(`A2AService.${method} error:`, error);
        return error instanceof Error ? error : new Error(error);
    }
}

module.exports = A2AService;
