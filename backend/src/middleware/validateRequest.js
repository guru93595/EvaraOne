const { ZodError } = require("zod");

const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    next(error);
  }
};

module.exports = validateRequest;
