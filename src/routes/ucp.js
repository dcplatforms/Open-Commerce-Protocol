/**
 * UCP Routes
 *
 * Defines API endpoints for Universal Commerce Protocol (UCP) operations.
 */

const express = require("express");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const Joi = require("joi");

module.exports = (ucpService) => {
  const router = express.Router();

  /**
   * POST /api/v1/ucp/process
   * Process a UCP-compliant commerce intent
   */
  router.post(
    "/process",
    authenticate,
    validate({
      body: Joi.object({
        ver: Joi.string().required(),
        intent: Joi.string().required(),
        sender: Joi.object({
          agent_id: Joi.string().required(),
          wallet_id: Joi.string(),
        }).required(),
        recipient: Joi.object({
          agent_id: Joi.string().required(),
          wallet_id: Joi.string(),
        }),
        amount: Joi.object({
          value: Joi.number().required(),
          currency: Joi.string(),
        }),
        data: Joi.object(),
      }),
    }),
    async (req, res, next) => {
      try {
        const result = await ucpService.processPayload(req.body);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/v1/ucp/schema
   * Get the JSON schema for UCP intents
   */
  router.get("/schema", async (req, res, next) => {
    try {
      const schema = ucpService.getUcpSchema();
      res.json(schema);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
