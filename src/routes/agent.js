/**
 * Agent Routes
 *
 * Defines API endpoints for Agent-related operations.
 */

const express = require("express");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const Joi = require("joi");

module.exports = (agentService) => {
  const router = express.Router();

  /**
   * GET /api/v1/agents
   * Get all registered agents
   */
  router.get("/", authenticate, async (req, res, next) => {
    try {
      const agents = await agentService.getAllAgents();
      res.json(agents);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/v1/agents
   * Register a new agent
   */
  router.post(
    "/",
    authenticate,
    validate({
      body: Joi.object({
        name: Joi.string().required(),
        ownerId: Joi.string().required(),
        walletId: Joi.string().required(),
        type: Joi.string().valid("personal", "business", "service"),
        config: Joi.object({
          limits: Joi.object({
            daily: Joi.number().min(0),
            perTransaction: Joi.number().min(0),
          }),
          authorizedCounterparties: Joi.array().items(Joi.string()),
          autoApprove: Joi.boolean(),
        }),
      }),
    }),
    async (req, res, next) => {
      try {
        const newAgent = await agentService.registerAgent(req.body);
        res.status(201).json(newAgent);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/v1/agents/:agentId
   * Get an agent by ID
   */
  router.get("/:agentId", authenticate, async (req, res, next) => {
    try {
      const agent = await agentService.getAgent(req.params.agentId);
      res.json(agent);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/v1/agents/:agentId/policy
   * Update an agent's policy
   */
  router.put(
    "/:agentId/policy",
    authenticate,
    validate({
      body: Joi.object({
        limits: Joi.object({
          daily: Joi.number().min(0),
          perTransaction: Joi.number().min(0),
        }),
        authorizedCounterparties: Joi.array().items(Joi.string()),
        autoApprove: Joi.boolean(),
      }),
    }),
    async (req, res, next) => {
      try {
        const updatedAgent = await agentService.updateAgentPolicy(
          req.params.agentId,
          req.body,
        );
        res.json(updatedAgent);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
};
