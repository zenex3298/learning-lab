// authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Use dummy user in development mode
    if (process.env.NODE_ENV === 'development') {
      req.user = { _id: 'test-user-id' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user; // Token must include _id
    next();
  });
}

module.exports = authenticateToken;
