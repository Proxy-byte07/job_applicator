/**
 * API Key Authentication Middleware
 *
 * Checks for a valid `x-api-key` header on every request.
 * Returns 401 if the key is missing or does not match the server's API_KEY.
 */
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const validKey = process.env.API_KEY || "my-secret-key-123";

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized — API key is missing. Provide it via the x-api-key header.",
    });
  }

  if (apiKey.trim() !== validKey.trim()) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized — invalid API key.",
    });
  }

  next();
};

module.exports = authMiddleware;
