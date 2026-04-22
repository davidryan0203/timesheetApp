const { validationResult } = require('express-validator');
const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const {
  buildPeriod,
  generateDefaultEntries,
  normalizeEntries,
  sumHours,
  toUTCDate,
} = require('../utils/timesheet');
const { sendTimesheetAssignedEmail } = require('../utils/mailer');

const APPROVAL_STATUSES = {
  DRAFT: 'draft',
  PENDING_MANAGER: 'pending_manager',
  MANAGER_APPROVED: 'manager_approved',
  MANAGER_REJECTED: 'manager_rejected',
  HR_HEAD_APPROVED: 'hr_head_approved',
  HR_HEAD_REJECTED: 'hr_head_rejected',
};

const formatDateOnly = (dateInput) => {
  return new Date(dateInput).toISOString().split('T')[0];
};

const canonicalizeRole = (role) => {
  if (role === 'dispatcher') {
    return 'hr';
  }
  return role;
};

const ASSIGNABLE_ROLES = ['staff', 'manager'];

const mapResponse = (timesheetDoc) => {
  const json = timesheetDoc.toObject();
  const hasUser = json.user && typeof json.user === 'object' && json.user._id;
  const hasManager = json.manager && typeof json.manager === 'object' && json.manager._id;

  return {
    id: json._id,
    user: hasUser
      ? {
          id: json.user._id,
          name: json.user.name,
          email: json.user.email,
          role: canonicalizeRole(json.user.role),
        }
      : undefined,
    manager: hasManager
      ? {
          id: json.manager._id,
          name: json.manager.name,
          email: json.manager.email,
        }
      : undefined,
    periodStart: json.periodStart,
    periodEnd: json.periodEnd,
    customTypes: json.customTypes || [],
    entries: json.entries.map((entry) => ({
      ...entry,
      dateOnly: new Date(entry.date).toISOString().split('T')[0],
    })),
    totalHours: json.totalHours,
    submittedAt: json.submittedAt,
    distributedAt: json.distributedAt,
    status: json.status || APPROVAL_STATUSES.DRAFT,
    managerReviewedAt: json.managerReviewedAt,
    managerComment: json.managerComment,
    hrHeadReviewedAt: json.hrHeadReviewedAt,
    hrHeadComment: json.hrHeadComment,
  };
};

const getTimesheetByDate = async (req, res) => {
  const targetDate = req.params.date || new Date().toISOString().split('T')[0];
  const { periodStart } = buildPeriod(targetDate);

  const existing = await Timesheet.findOne({
    user: req.user.id,
    periodStart,
  });

  if (!existing) {
    return res.status(404).json({
      message: 'No assigned timesheet for this pay period.',
    });
  }

  return res.json(mapResponse(existing));
};

const saveTimesheetByDate = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const targetDate = req.params.date || new Date().toISOString().split('T')[0];
  const { periodStart, periodEnd } = buildPeriod(targetDate);

  const existing = await Timesheet.findOne({
    user: req.user.id,
    periodStart,
  });

  if (!existing) {
    return res.status(404).json({
      message: 'No assigned timesheet for this pay period.',
    });
  }

  if (
    [
      APPROVAL_STATUSES.PENDING_MANAGER,
      APPROVAL_STATUSES.MANAGER_APPROVED,
      APPROVAL_STATUSES.HR_HEAD_APPROVED,
    ].includes(existing?.status)
  ) {
    return res.status(409).json({
      message: 'This pay period is already submitted and cannot be edited or re-submitted.',
    });
  }

  const normalizedEntries = normalizeEntries(req.body.entries || []);
  const totalHours = sumHours(normalizedEntries);
  const customTypes = Array.isArray(req.body.customTypes)
    ? req.body.customTypes
        .filter((type) => typeof type === 'string' && type.trim())
        .map((type) => type.trim())
    : ['Regular Hours', 'Overtime', 'Half Day', 'Sick Leave', 'Vacation Leave'];

  const timesheet = await Timesheet.findOneAndUpdate(
    { _id: existing._id },
    {
      periodEnd,
      entries: normalizedEntries,
      customTypes,
      totalHours,
      submittedAt: req.body.submit ? new Date() : null,
      status: APPROVAL_STATUSES.DRAFT,
    },
    { new: true }
  );

  if (req.body.submit) {
    const currentUser = await User.findById(req.user.id).select('role manager');
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (currentUser.role === 'manager') {
      timesheet.submittedAt = new Date();
      timesheet.status = APPROVAL_STATUSES.MANAGER_APPROVED;
      timesheet.manager = currentUser._id;
      timesheet.managerReviewedAt = new Date();
      timesheet.managerComment = 'Auto-approved manager self timesheet';
      await timesheet.save();
    } else {
      if (!currentUser.manager) {
        return res.status(400).json({
          message: 'No manager is assigned to your account. Please contact admin.',
        });
      }

      timesheet.submittedAt = new Date();
      timesheet.status = APPROVAL_STATUSES.PENDING_MANAGER;
      timesheet.manager = currentUser.manager;
      timesheet.managerReviewedAt = null;
      timesheet.managerComment = '';
      await timesheet.save();
    }
  }

  return res.json(mapResponse(timesheet));
};

const sendOutTimesheets = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { periodFrom, periodTo } = req.body;
  const periodStart = toUTCDate(periodFrom);
  const periodEnd = toUTCDate(periodTo);

  if (periodStart > periodEnd) {
    return res.status(400).json({ message: 'Pay period From must be earlier than or equal to To.' });
  }

  const overlappingTimesheet = await Timesheet.findOne({
    periodStart: { $lte: periodEnd },
    periodEnd: { $gte: periodStart },
  })
    .sort({ periodStart: -1 })
    .select('periodStart periodEnd');

  if (overlappingTimesheet) {
    const overlapFrom = formatDateOnly(overlappingTimesheet.periodStart);
    const overlapTo = formatDateOnly(overlappingTimesheet.periodEnd);
    return res.status(409).json({
      message: `Pay period overlaps an existing dispatched period (${overlapFrom} to ${overlapTo}).`,
    });
  }

  const staffUsers = await User.find({ role: { $in: ASSIGNABLE_ROLES } }).select('_id name email role manager');

  if (staffUsers.length === 0) {
    return res.status(400).json({ message: 'No staff or manager users found to assign timesheets.' });
  }

  let createdCount = 0;
  let alreadyAssignedCount = 0;
  let notificationSentCount = 0;
  let notificationFailedCount = 0;
  let notificationSkippedCount = 0;

  for (const staff of staffUsers) {
    const existing = await Timesheet.findOne({
      user: staff._id,
      periodStart,
      periodEnd,
    });

    if (existing) {
      alreadyAssignedCount += 1;
      continue;
    }

    const entries = generateDefaultEntries(periodStart, periodEnd);
    await Timesheet.create({
      user: staff._id,
      assignedBy: req.user.id,
      distributedAt: new Date(),
      periodStart,
      periodEnd,
      entries,
      customTypes: ['Regular Hours', 'Overtime', 'Half Day', 'Sick Leave', 'Vacation Leave'],
      totalHours: sumHours(entries),
      submittedAt: null,
      status: APPROVAL_STATUSES.DRAFT,
      manager: staff.manager || null,
      managerComment: '',
      hrHeadComment: '',
    });

    try {
      const emailResult = await sendTimesheetAssignedEmail({
        toEmail: staff.email,
        toName: staff.name,
        periodStart: formatDateOnly(periodStart),
        periodEnd: formatDateOnly(periodEnd),
        dispatcherName: req.user.name,
      });

      if (emailResult?.skipped) {
        notificationSkippedCount += 1;
      } else {
        notificationSentCount += 1;
      }
    } catch (error) {
      notificationFailedCount += 1;
      console.error(`Failed to send timesheet email to ${staff.email}:`, error.message);
    }

    createdCount += 1;
  }

  return res.status(201).json({
    message: 'Timesheets sent out successfully.',
    periodStart: formatDateOnly(periodStart),
    periodEnd: formatDateOnly(periodEnd),
    createdCount,
    alreadyAssignedCount,
    totalStaff: staffUsers.length,
    notifications: {
      sent: notificationSentCount,
      failed: notificationFailedCount,
      skipped: notificationSkippedCount,
    },
  });
};

const getSubmissionStatusByRange = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ message: 'Both from and to query params are required.' });
  }

  const periodStart = toUTCDate(from);
  const periodEnd = toUTCDate(to);

  if (periodStart > periodEnd) {
    return res.status(400).json({ message: 'From must be earlier than or equal to To.' });
  }

  const staffUsers = await User.find({ role: { $in: ASSIGNABLE_ROLES } }).select('_id name email role');
  const timesheets = await Timesheet.find({ periodStart, periodEnd })
    .populate('manager', 'name email')
    .select('user submittedAt distributedAt totalHours status manager');
  const mapByUserId = new Map(timesheets.map((item) => [String(item.user), item]));

  const statusRows = staffUsers.map((staff) => {
    const row = mapByUserId.get(String(staff._id));
    return {
      user: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: canonicalizeRole(staff.role),
      },
      assigned: Boolean(row),
      submitted: Boolean(row?.submittedAt),
      submittedAt: row?.submittedAt || null,
      totalHours: row?.totalHours || 0,
      status: row?.status || APPROVAL_STATUSES.DRAFT,
      manager: row?.manager
        ? {
            id: row.manager._id,
            name: row.manager.name,
            email: row.manager.email,
          }
        : null,
    };
  });

  return res.json({
    periodStart: formatDateOnly(periodStart),
    periodEnd: formatDateOnly(periodEnd),
    statuses: statusRows,
  });
};

const getAllSubmittedTimesheets = async (req, res) => {
  const timesheets = await Timesheet.find({ submittedAt: { $ne: null } })
    .populate('user', 'name email role')
    .populate('manager', 'name email')
    .sort({ submittedAt: -1 })
    .limit(100);

  return res.json(timesheets.map(mapResponse));
};

const getRecentTimesheets = async (req, res) => {
  const timesheets = await Timesheet.find({ user: req.user.id })
    .populate('manager', 'name email')
    .sort({ periodStart: -1 })
    .limit(24);

  return res.json(timesheets.map(mapResponse));
};

const getManagerApprovalQueue = async (req, res) => {
  const timesheets = await Timesheet.find({ manager: req.user.id, status: APPROVAL_STATUSES.PENDING_MANAGER })
    .populate('user', 'name email role')
    .populate('manager', 'name email')
    .sort({ submittedAt: -1 })
    .limit(100);

  return res.json(timesheets.map(mapResponse));
};

const managerReviewTimesheet = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { id } = req.params;
  const { decision, comment } = req.body;

  const timesheet = await Timesheet.findById(id).populate('user', 'name email role').populate('manager', 'name email');
  if (!timesheet) {
    return res.status(404).json({ message: 'Timesheet not found' });
  }

  if (String(timesheet.manager?._id || timesheet.manager) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only review timesheets assigned to you' });
  }

  if (timesheet.status !== APPROVAL_STATUSES.PENDING_MANAGER) {
    return res.status(409).json({ message: 'Timesheet is not pending manager approval' });
  }

  timesheet.status =
    decision === 'approve' ? APPROVAL_STATUSES.MANAGER_APPROVED : APPROVAL_STATUSES.MANAGER_REJECTED;
  timesheet.managerReviewedAt = new Date();
  timesheet.managerComment = typeof comment === 'string' ? comment.trim() : '';

  await timesheet.save();
  return res.json(mapResponse(timesheet));
};

const getHrReviewQueue = async (_req, res) => {
  const timesheets = await Timesheet.find({ status: APPROVAL_STATUSES.MANAGER_APPROVED })
    .populate('user', 'name email role')
    .populate('manager', 'name email')
    .sort({ managerReviewedAt: -1 })
    .limit(100);

  return res.json(timesheets.map(mapResponse));
};

const getHrHeadReviewQueue = async (_req, res) => {
  const timesheets = await Timesheet.find({ status: APPROVAL_STATUSES.MANAGER_APPROVED })
    .populate('user', 'name email role')
    .populate('manager', 'name email')
    .sort({ managerReviewedAt: -1 })
    .limit(100);

  return res.json(timesheets.map(mapResponse));
};

const hrHeadReviewTimesheet = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { id } = req.params;
  const { decision, comment } = req.body;

  const timesheet = await Timesheet.findById(id).populate('user', 'name email role').populate('manager', 'name email');
  if (!timesheet) {
    return res.status(404).json({ message: 'Timesheet not found' });
  }

  if (timesheet.status !== APPROVAL_STATUSES.MANAGER_APPROVED) {
    return res.status(409).json({ message: 'Timesheet is not ready for HR Head review' });
  }

  timesheet.status =
    decision === 'approve' ? APPROVAL_STATUSES.HR_HEAD_APPROVED : APPROVAL_STATUSES.HR_HEAD_REJECTED;
  timesheet.hrHeadReviewedAt = new Date();
  timesheet.hrHeadComment = typeof comment === 'string' ? comment.trim() : '';

  await timesheet.save();
  return res.json(mapResponse(timesheet));
};

module.exports = {
  getTimesheetByDate,
  saveTimesheetByDate,
  sendOutTimesheets,
  getSubmissionStatusByRange,
  getAllSubmittedTimesheets,
  getRecentTimesheets,
  getManagerApprovalQueue,
  managerReviewTimesheet,
  getHrReviewQueue,
  getHrHeadReviewQueue,
  hrHeadReviewTimesheet,
};
