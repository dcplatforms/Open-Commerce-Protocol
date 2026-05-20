/**
 * Validation Middleware
 *
 * Uses Joi to validate request schemas.
 */

const Joi = require("joi");

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = Joi.object(schema).validate(
      {
        body: req.body,
        params: req.params,
        query: req.query,
      },
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );

    if (error) {
      const errors = error.details.map((detail) => ({
        message: detail.message,
        path: detail.path,
      }));
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        errors,
      });
    }

    // Assign validated values to the request object
    req.body = value.body || {};
    req.params = value.params || {};
    req.query = value.query || {};

    next();
  };
};

module.exports = {
  validate,
};
