/**
 * Mobile Payment Routes
 *
 * API endpoints for Apple Pay and Google Pay.
 */

const express = require("express");
const router = express.Router();
const MobilePaymentService = require("../services/mobilePayment");
const WalletService = require("../services/wallet");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const Joi = require("joi");

module.exports = (mobilePaymentService) => {
  const router = express.Router();

  /**
   * Initialize Apple Pay session
   * POST /api/v1/payments/applepay/init
   */
  router.post(
    "/applepay/init",
    authenticate,
    validate({
      body: Joi.object({
        walletId: Joi.string().required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().length(3).uppercase().default("USD"),
      }),
    }),
    async (req, res, next) => {
      try {
        const session = await mobilePaymentService.initializeApplePay(req.body);
        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Process Apple Pay payment
   * POST /api/v1/payments/applepay/process
   */
  router.post(
    "/applepay/process",
    authenticate,
    validate({
      body: Joi.object({
        sessionId: Joi.string().required(),
        paymentData: Joi.object().required(),
      }),
    }),
    async (req, res, next) => {
      try {
        const result = await mobilePaymentService.processApplePay(req.body);
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
   * Initialize Google Pay session
   * POST /api/v1/payments/googlepay/init
   */
  router.post(
    "/googlepay/init",
    authenticate,
    validate({
      body: Joi.object({
        walletId: Joi.string().required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().length(3).uppercase().default("USD"),
      }),
    }),
    async (req, res, next) => {
      try {
        const session = await mobilePaymentService.initializeGooglePay(
          req.body,
        );
        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Process Google Pay payment
   * POST /api/v1/payments/googlepay/process
   */
  router.post(
    "/googlepay/process",
    authenticate,
    validate({
      body: Joi.object({
        sessionId: Joi.string().required(),
        paymentData: Joi.object().required(),
      }),
    }),
    async (req, res, next) => {
      try {
        const result = await mobilePaymentService.processGooglePay(req.body);
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
   * Get session status
   * GET /api/v1/payments/session/:sessionId
   */
  router.get("/session/:sessionId", authenticate, async (req, res, next) => {
    try {
      const status = await mobilePaymentService.getSessionStatus(
        req.params.sessionId,
      );
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Cancel a session
   * DELETE /api/v1/payments/session/:sessionId
   */
  router.delete("/session/:sessionId", authenticate, async (req, res, next) => {
    try {
      await mobilePaymentService.cancelSession(req.params.sessionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
};
