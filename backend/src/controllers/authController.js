const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const canonicalizeRole = (role) => {
  if (role === 'dispatcher') {
    return 'hr';
  }
  return role;
};

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
      role: canonicalizeRole(user.role),
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password, role } = req.body;
  const managerIdRaw = req.body.managerId || req.body.manager || req.body.assignedManagerId;
  const managerId = typeof managerIdRaw === 'string' ? managerIdRaw.trim() : managerIdRaw;
  const normalizedRole = canonicalizeRole(role || 'staff');

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  if (normalizedRole === 'staff') {
    if (!managerId) {
      return res.status(400).json({ message: 'Staff users must have a manager assigned' });
    }

    const manager = await User.findOne({ _id: managerId, role: { $in: ['manager'] } });
    if (!manager) {
      return res.status(400).json({ message: 'Assigned manager does not exist' });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: passwordHash,
    role: normalizedRole,
    manager: normalizedRole === 'staff' ? managerId : null,
  });

  const token = signToken(user);

  return res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: canonicalizeRole(user.role),
      manager: user.manager,
    },
  });
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken(user);

  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: canonicalizeRole(user.role),
      manager: user.manager,
    },
  });
};

const listManagers = async (_req, res) => {
  const managers = await User.find({ role: 'manager' }).select('_id name email').sort({ name: 1 });
  return res.json(
    managers.map((manager) => ({
      id: manager._id,
      name: manager.name,
      email: manager.email,
    }))
  );
};

const me = async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.role = canonicalizeRole(user.role);

  return res.json(user);
};

module.exports = {
  register,
  login,
  me,
  listManagers,
};
