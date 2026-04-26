const { validationResult } = require('express-validator');
const RoleDelegation = require('../models/RoleDelegation');
const User = require('../models/User');

const canonicalizeRole = (role) => {
  if (role === 'dispatcher') {
    return 'hr';
  }
  return role;
};

const getActiveDelegations = async (userId) => {
  const now = new Date();

  const delegations = await RoleDelegation.find({
    staffId: userId,
    status: 'active',
    startDate: { $lte: now },
    $or: [{ endDate: null }, { endDate: { $gte: now } }],
  }).select('delegatedRole');

  return delegations.map((item) => canonicalizeRole(item.delegatedRole));
};

const getAvailableRoles = async (req, res) => {
  const user = await User.findById(req.user.id).select('_id role activeRole');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const roles = new Set([canonicalizeRole(user.role)]);
  const delegatedRoles = await getActiveDelegations(user._id);
  delegatedRoles.forEach((role) => roles.add(role));

  const activeRole = user.activeRole ? canonicalizeRole(user.activeRole) : null;
  const effectiveRole = canonicalizeRole(activeRole || user.role);

  return res.json({
    roles: Array.from(roles),
    primaryRole: canonicalizeRole(user.role),
    activeRole,
    effectiveRole,
  });
};

const switchActiveRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { role } = req.body;

  const user = await User.findById(req.user.id).select('_id name email role activeRole manager');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const availableRolesResponse = await (async () => {
    const roles = new Set([canonicalizeRole(user.role)]);
    const delegatedRoles = await getActiveDelegations(user._id);
    delegatedRoles.forEach((itemRole) => roles.add(itemRole));
    return Array.from(roles);
  })();

  const requestedRole = canonicalizeRole(role);
  if (!availableRolesResponse.includes(requestedRole)) {
    return res.status(403).json({ message: 'Selected role is not available for this account' });
  }

  const primaryRole = canonicalizeRole(user.role);
  user.activeRole = requestedRole === primaryRole ? null : requestedRole;
  await user.save();

  const activeRole = user.activeRole ? canonicalizeRole(user.activeRole) : null;
  const effectiveRole = canonicalizeRole(activeRole || user.role);

  return res.json({
    message: 'Active role updated successfully',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      manager: user.manager,
      role: effectiveRole,
      primaryRole,
      activeRole,
    },
    availableRoles: availableRolesResponse,
  });
};

const createDelegation = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { staffId, delegatedRole, reason, startDate, endDate } = req.body;

  const staff = await User.findById(staffId).select('_id role');
  if (!staff) {
    return res.status(404).json({ message: 'Staff user not found' });
  }

  if (canonicalizeRole(staff.role) !== 'staff') {
    return res.status(400).json({ message: 'Delegations can only be assigned to staff accounts' });
  }

  const normalizedRole = canonicalizeRole(delegatedRole);
  if (normalizedRole === 'staff') {
    return res.status(400).json({ message: 'Cannot delegate staff role as an extra role' });
  }

  const delegationStart = startDate ? new Date(startDate) : new Date();
  const delegationEnd = endDate ? new Date(endDate) : null;

  if (Number.isNaN(delegationStart.getTime())) {
    return res.status(400).json({ message: 'Invalid startDate' });
  }

  if (delegationEnd && Number.isNaN(delegationEnd.getTime())) {
    return res.status(400).json({ message: 'Invalid endDate' });
  }

  if (delegationEnd && delegationEnd < delegationStart) {
    return res.status(400).json({ message: 'endDate must be later than startDate' });
  }

  const existing = await RoleDelegation.findOne({
    staffId,
    delegatedRole,
    status: 'active',
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  }).select('_id');

  if (existing) {
    return res.status(409).json({ message: 'An active delegation for this role already exists' });
  }

  const delegation = await RoleDelegation.create({
    staffId,
    delegatedRole,
    delegatedBy: req.user.id,
    reason: typeof reason === 'string' ? reason.trim() : '',
    startDate: delegationStart,
    endDate: delegationEnd,
    status: 'active',
  });

  await User.findByIdAndUpdate(staffId, { $addToSet: { delegatedRoles: delegation._id } });

  return res.status(201).json({
    id: delegation._id,
    staffId: delegation.staffId,
    delegatedRole: canonicalizeRole(delegation.delegatedRole),
    delegatedBy: delegation.delegatedBy,
    reason: delegation.reason,
    startDate: delegation.startDate,
    endDate: delegation.endDate,
    status: delegation.status,
  });
};

const listDelegations = async (req, res) => {
  const query = {};
  if (req.query.staffId) {
    query.staffId = req.query.staffId;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }

  const delegations = await RoleDelegation.find(query)
    .populate('staffId', 'name email role')
    .populate('delegatedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(500);

  return res.json(
    delegations.map((item) => ({
      id: item._id,
      staff: item.staffId
        ? {
            id: item.staffId._id,
            name: item.staffId.name,
            email: item.staffId.email,
            role: canonicalizeRole(item.staffId.role),
          }
        : null,
      delegatedBy: item.delegatedBy
        ? {
            id: item.delegatedBy._id,
            name: item.delegatedBy.name,
            email: item.delegatedBy.email,
          }
        : null,
      delegatedRole: canonicalizeRole(item.delegatedRole),
      reason: item.reason,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      createdAt: item.createdAt,
    }))
  );
};

const revokeDelegation = async (req, res) => {
  const delegation = await RoleDelegation.findById(req.params.id);
  if (!delegation) {
    return res.status(404).json({ message: 'Delegation not found' });
  }

  delegation.status = 'revoked';
  await delegation.save();

  const staff = await User.findById(delegation.staffId).select('_id role activeRole');
  if (staff && canonicalizeRole(staff.activeRole) === canonicalizeRole(delegation.delegatedRole)) {
    staff.activeRole = null;
    await staff.save();
  }

  return res.json({ message: 'Delegation revoked successfully' });
};

module.exports = {
  getAvailableRoles,
  switchActiveRole,
  createDelegation,
  listDelegations,
  revokeDelegation,
};
