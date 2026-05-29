/**
 * Wallet Routes
 *
 * API endpoints for wallet management
 */

const express = require("express");
const router = express.Router();
const WalletService = require("../services/wallet");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const Joi = require("joi");

module.exports = (walletService) => {
  const router = express.Router();

  /**
   * Create wallet
   * POST /api/v1/wallet
   */
  router.post(
    "/",
    authenticate,
    validate({
      body: Joi.object({
        userId: Joi.string().required(),
        currency: Joi.string().length(3).uppercase().default("USD"),
        initialBalance: Joi.number().min(0).default(0),
      }),
    }),
    async (req, res, next) => {
      try {
        const wallet = await walletService.createWallet(req.body);
        res.status(201).json({
          success: true,
          data: wallet,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Get wallet by ID
   * GET /api/v1/wallet/:walletId
   */
  router.get("/:walletId", authenticate, async (req, res, next) => {
    try {
      const wallet = await walletService.getWallet(req.params.walletId);
      res.json({
        success: true,
        data: wallet,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Add funds to wallet
   * POST /api/v1/wallet/:walletId/fund
   */
  router.post(
    "/:walletId/fund",
    authenticate,
    validate({
      body: Joi.object({
        amount: Joi.number().positive().required(),
        paymentToken: Joi.string().required(),
        description: Joi.string().max(500),
      }),
    }),
    async (req, res, next) => {
      try {
        const result = await walletService.addFunds({
          walletId: req.params.walletId,
          ...req.body,
        });
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Get wallet transactions
   * GET /api/v1/wallet/:walletId/transactions
   */
  router.get(
    "/:walletId/transactions",
    authenticate,
    async (req, res, next) => {
      try {
        const { page = 1, limit = 20, type, status } = req.query;
        const result = await walletService.getTransactions(
          req.params.walletId,
          { page: parseInt(page), limit: parseInt(limit), type, status },
        );
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Get wallet statistics
   * GET /api/v1/wallet/:walletId/stats
   */
  router.get("/:walletId/stats", authenticate, async (req, res, next) => {
    try {
      const stats = await walletService.getWalletStats(req.params.walletId);
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
