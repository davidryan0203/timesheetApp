const { validationResult } = require('express-validator');
const User = require('../models/User');

const buildBalances = (user) => {
  return {
    annualLeave: Number(user.leaveBalances?.annualLeave || 0),
    sickLeave: Number(user.leaveBalances?.sickLeave || 0),
    timeInLieu: Number(user.leaveBalances?.timeInLieu || 0),
    discretionaryLeave: Number(user.leaveBalances?.discretionaryLeave || 0),
    nonDiscretionaryLeave: Number(user.leaveBalances?.nonDiscretionaryLeave || 0),
  };
};

const getMyLeaveBalances = async (req, res) => {
  const user = await User.findById(req.user.id).select('_id name email role leaveBalances');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    balances: buildBalances(user),
  });
};

const getLeaveBalancesByUser = async (req, res) => {
  const targetUser = await User.findById(req.params.userId).select('_id name email role leaveBalances');
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    user: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
    },
    balances: buildBalances(targetUser),
  });
};

const updateLeaveBalances = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const targetUser = await User.findById(req.params.userId).select('_id leaveBalances name email role');
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  const payload = req.body || {};
  const nextBalances = {
    annualLeave: payload.annualLeave,
    sickLeave: payload.sickLeave,
    timeInLieu: payload.timeInLieu,
    discretionaryLeave: payload.discretionaryLeave,
    nonDiscretionaryLeave: payload.nonDiscretionaryLeave,
  };

  Object.entries(nextBalances).forEach(([key, value]) => {
    if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
      targetUser.leaveBalances[key] = value;
    }
  });

  await targetUser.save();

  return res.json({
    message: 'Leave balances updated successfully',
    user: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
    },
    balances: buildBalances(targetUser),
  });
};

module.exports = {
  getMyLeaveBalances,
  getLeaveBalancesByUser,
  updateLeaveBalances,
};
