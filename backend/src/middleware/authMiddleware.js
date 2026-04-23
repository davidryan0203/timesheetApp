const jwt = require('jsonwebtoken');
const User = require('../models/User');

const canonicalizeRole = (role) => {
  if (role === 'dispatcher') {
    return 'hr';
  }
  return role;
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.id).select('_id role sessionVersion');
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const tokenSessionVersion = Number(payload.sessionVersion || 0);
    const currentSessionVersion = Number(user.sessionVersion || 0);
    if (tokenSessionVersion !== currentSessionVersion) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    req.user = {
      ...payload,
      role: canonicalizeRole(user.role || payload.role),
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = authMiddleware;
