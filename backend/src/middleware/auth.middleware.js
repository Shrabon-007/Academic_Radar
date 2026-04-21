const jwt = require("jsonwebtoken");

const authGuard = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Missing bearer token.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Invalid or expired token.",
    });
  }
};

module.exports = { authGuard };
