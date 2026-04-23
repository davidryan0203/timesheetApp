const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/mailer');

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
      sessionVersion: Number(user.sessionVersion || 0),
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const resolveRoleAndManager = async (inputBody) => {
  const { role } = inputBody;
  const managerIdRaw = inputBody.managerId || inputBody.manager || inputBody.assignedManagerId;
  const managerId = typeof managerIdRaw === 'string' ? managerIdRaw.trim() : managerIdRaw;
  const normalizedRole = canonicalizeRole(role || 'staff');

  if (normalizedRole === 'staff') {
    if (!managerId) {
      return { error: 'Staff users must have a manager assigned' };
    }

    const manager = await User.findOne({ _id: managerId, role: { $in: ['manager'] } });
    if (!manager) {
      return { error: 'Assigned manager does not exist' };
    }
  }

  if (normalizedRole === 'manager') {
    if (!managerId) {
      return { error: 'Manager users must have a CEO assigned' };
    }

    const ceo = await User.findOne({ _id: managerId, role: { $in: ['ceo'] } });
    if (!ceo) {
      return { error: 'Assigned CEO does not exist' };
    }
  }

  return {
    normalizedRole,
    managerId,
  };
};

const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  const roleInfo = await resolveRoleAndManager(req.body);
  if (roleInfo.error) {
    return res.status(400).json({ message: roleInfo.error });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: passwordHash,
    role: roleInfo.normalizedRole,
    manager: ['staff', 'manager'].includes(roleInfo.normalizedRole) ? roleInfo.managerId : null,
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

const createUserByAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  const roleInfo = await resolveRoleAndManager(req.body);
  if (roleInfo.error) {
    return res.status(400).json({ message: roleInfo.error });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: passwordHash,
    role: roleInfo.normalizedRole,
    manager: ['staff', 'manager'].includes(roleInfo.normalizedRole) ? roleInfo.managerId : null,
  });

  return res.status(201).json({
    message: 'User account created successfully',
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

const listCeos = async (_req, res) => {
  const ceos = await User.find({ role: 'ceo' }).select('_id name email').sort({ name: 1 });
  return res.json(
    ceos.map((ceo) => ({
      id: ceo._id,
      name: ceo.name,
      email: ceo.email,
    }))
  );
};

const listUsersForAdmin = async (_req, res) => {
  const users = await User.find({})
    .select('_id name email role manager createdAt')
    .populate('manager', 'name email role')
    .sort({ createdAt: -1, name: 1 });

  return res.json(
    users.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: canonicalizeRole(user.role),
      createdAt: user.createdAt,
      manager: user.manager
        ? {
            id: user.manager._id,
            name: user.manager.name,
            email: user.manager.email,
            role: canonicalizeRole(user.manager.role),
          }
        : null,
    }))
  );
};

const requestPasswordResetByAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { userId } = req.body;
  const targetUser = await User.findById(userId).select('_id name email role');
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  targetUser.resetPasswordTokenHash = tokenHash;
  targetUser.resetPasswordTokenExpiresAt = expiresAt;
  await targetUser.save();

  const baseClientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const resetUrl = `${baseClientUrl}/reset-password?token=${rawToken}`;

  try {
    const emailResult = await sendPasswordResetEmail({
      toEmail: targetUser.email,
      toName: targetUser.name,
      resetUrl,
      requestedBy: req.user?.name || 'Administrator',
    });

    return res.json({
      message: emailResult?.skipped
        ? `Reset token generated but email dispatch skipped: ${emailResult.reason}`
        : 'Password reset email sent successfully.',
      skipped: Boolean(emailResult?.skipped),
    });
  } catch (error) {
    console.error('Failed to send password reset email:', error.message);
    return res.status(500).json({ message: 'Unable to send password reset email' });
  }
};

const resetPasswordWithToken = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { token, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Password and confirm password do not match' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordTokenExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Reset link is invalid or has expired' });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordTokenHash = null;
  user.resetPasswordTokenExpiresAt = null;
  user.sessionVersion = Number(user.sessionVersion || 0) + 1;
  await user.save();

  return res.json({ message: 'Password has been reset successfully. Please log in again.' });
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
  listCeos,
  createUserByAdmin,
  listUsersForAdmin,
  requestPasswordResetByAdmin,
  resetPasswordWithToken,
};
