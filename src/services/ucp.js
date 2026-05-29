/**
 * Universal Commerce Protocol (UCP) Service
 *
 * Facilitates standardized communication of commerce intents across various platforms.
 * Parses, validates, and processes UCP-compliant messages, translating them into
 * system-specific transaction logic via A2AService.
 */

const Joi = require('joi');
const logger = require('../utils/logger');

class UCPService {
  constructor(a2aService, config = {}) {
    this.a2aService = a2aService;
    this.config = config;

    // Standard UCP Schema
    this.ucpIntentSchema = Joi.object({
      ver: Joi.string().required(),
      intent: Joi.string().valid('transfer', 'payment', 'purchase', 'request', 'offer').required(),
      sender: Joi.object({
        agent_id: Joi.string().required(),
        wallet_id: Joi.string().optional()
      }).required(),
      recipient: Joi.object({
        agent_id: Joi.string().required(),
        wallet_id: Joi.string().optional()
      }).optional(),
      amount: Joi.object({
        value: Joi.number().positive().required(),
        currency: Joi.string().default('USD')
      }).optional(),
      data: Joi.object().optional(),
      timestamp: Joi.date().iso().default(() => new Date())
    });
  }

  /**
   * Process a UCP Payload
   * @param {Object} payload - The raw UCP JSON payload
   * @param {string} mandate - Optional signed Mandate (AP2) for Zero Trust validation
   */
  async processPayload(payload, mandate) {
    try {
      // 1. Validate the UCP intent against schema
      const { error, value } = this.ucpIntentSchema.validate(payload, { stripUnknown: true });
      if (error) {
        throw new Error(`Zero Trust Validation Failed: UCP Intent validation failed: ${error.details.map(x => x.message).join(', ')}`);
      }

      const validatedPayload = value;
      const { intent } = validatedPayload;

      switch (intent) {
        case 'transfer':
        case 'payment':
          return this._handleTransfer(validatedPayload, mandate);
        case 'purchase':
          // Future implementation: integration with Inventory/Order services
          return { status: 'success', message: 'Purchase intent received (simulation)', payload: validatedPayload };
        default:
          return { status: 'success', message: `UCP intent '${intent}' received and logged.`, payload: validatedPayload };
      }
    } catch (error) {
      throw this._handleError('processPayload', error);
    }
  }

  /**
   * Handle transfer/payment intents via A2AService
   * @private
   */
  async _handleTransfer(payload, mandate) {
    const { sender, recipient, amount } = payload;

    if (!recipient?.agent_id) {
      throw new Error('Zero Trust Validation Failed: Missing recipient agent_id for transfer');
    }
    if (!amount?.value) {
      throw new Error('Zero Trust Validation Failed: Missing amount value');
    }

    return this.a2aService.executeTransfer({
      fromAgentId: sender.agent_id,
      toAgentId: recipient.agent_id,
      amount: amount.value,
      mandate,
      ucpPayload: payload
    });
  }

  /**
   * Get UCP Schema (conceptual)
   */
  getUcpSchema() {
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Universal Commerce Protocol Intent",
      type: "object",
      properties: {
        ver: { type: "string" },
        intent: { type: "string", enum: ["transfer", "payment", "purchase", "request", "offer"] },
        sender: {
          type: "object",
          properties: { agent_id: { type: "string" } },
          required: ["agent_id"]
        },
        recipient: {
          type: "object",
          properties: { agent_id: { type: "string" } }
        },
        amount: {
          type: "object",
          properties: {
            value: { type: "number" },
            currency: { type: "string" }
          }
        }
      },
      required: ["ver", "intent", "sender"]
    };
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(method, error) {
    logger.error(`UCPService.${method} error:`, error);
    return error instanceof Error ? error : new Error(error);
  }
}

module.exports = UCPService;
