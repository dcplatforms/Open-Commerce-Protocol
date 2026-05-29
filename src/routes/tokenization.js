/**
 * Tokenization Routes
 *
 * API endpoints for payment tokenization.
 */

const express = require("express");
const router = express.Router();
const TokenizationService = require("../services/tokenization");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const Joi = require("joi");

module.exports = (tokenizationService) => {
  const router = express.Router();

  /**
   * Create a card token
   * POST /api/v1/tokens/card
   */
  router.post(
    "/card",
    authenticate,
    validate({
      body: Joi.object({
        number: Joi.string().creditCard().required(),
        exp_month: Joi.string().length(2).required(),
        exp_year: Joi.string().length(4).required(),
        cvc: Joi.string().min(3).max(4).required(),
      }),
    }),
    async (req, res, next) => {
      try {
        const token = await tokenizationService.createCardToken(req.body);
        res.status(201).json({
          success: true,
          data: token,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Get a token by ID
   * GET /api/v1/tokens/:tokenId
   */
  router.get("/:tokenId", authenticate, async (req, res, next) => {
    try {
      const token = await tokenizationService.getToken(req.params.tokenId);
      res.json({
        success: true,
        data: token,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Delete a token by ID
   * DELETE /api/v1/tokens/:tokenId
   */
  router.delete("/:tokenId", authenticate, async (req, res, next) => {
    try {
      await tokenizationService.deleteToken(req.params.tokenId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
};
