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

const formatDateOnly = (dateInput) => {
  return new Date(dateInput).toISOString().split('T')[0];
};

const mapResponse = (timesheetDoc) => {
  const json = timesheetDoc.toObject();
  const hasUser = json.user && typeof json.user === 'object' && json.user._id;

  return {
    id: json._id,
    user: hasUser
      ? {
          id: json.user._id,
          name: json.user.name,
          email: json.user.email,
          role: json.user.role,
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

  if (existing?.submittedAt) {
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
    },
    { new: true }
  );

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

  const dayDiff = Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff !== 13) {
    return res.status(400).json({
      message: 'Pay period must cover exactly 14 days (From to To inclusive).',
    });
  }

  const staffUsers = await User.find({ role: 'staff' }).select('_id name email role');

  if (staffUsers.length === 0) {
    return res.status(400).json({ message: 'No staff users found to assign timesheets.' });
  }

  let createdCount = 0;
  let alreadyAssignedCount = 0;

  for (const staff of staffUsers) {
    const existing = await Timesheet.findOne({
      user: staff._id,
      periodStart,
    });

    if (existing) {
      alreadyAssignedCount += 1;
      continue;
    }

    const entries = generateDefaultEntries(periodStart);
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
    });
    createdCount += 1;
  }

  return res.status(201).json({
    message: 'Timesheets sent out successfully.',
    periodStart: formatDateOnly(periodStart),
    periodEnd: formatDateOnly(periodEnd),
    createdCount,
    alreadyAssignedCount,
    totalStaff: staffUsers.length,
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

  const dayDiff = Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff !== 13) {
    return res.status(400).json({
      message: 'Status range must cover exactly 14 days (From to To inclusive).',
    });
  }

  const staffUsers = await User.find({ role: 'staff' }).select('_id name email');
  const timesheets = await Timesheet.find({ periodStart }).select('user submittedAt distributedAt totalHours');
  const mapByUserId = new Map(timesheets.map((item) => [String(item.user), item]));

  const statusRows = staffUsers.map((staff) => {
    const row = mapByUserId.get(String(staff._id));
    return {
      user: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
      },
      assigned: Boolean(row),
      submitted: Boolean(row?.submittedAt),
      submittedAt: row?.submittedAt || null,
      totalHours: row?.totalHours || 0,
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
    .sort({ submittedAt: -1 })
    .limit(100);

  return res.json(timesheets.map(mapResponse));
};

const getRecentTimesheets = async (req, res) => {
  const timesheets = await Timesheet.find({ user: req.user.id })
    .sort({ periodStart: -1 })
    .limit(24);

  return res.json(timesheets.map(mapResponse));
};

module.exports = {
  getTimesheetByDate,
  saveTimesheetByDate,
  sendOutTimesheets,
  getSubmissionStatusByRange,
  getAllSubmittedTimesheets,
  getRecentTimesheets,
};
