const express = require('express');
const { body } = require('express-validator');
const {
  getTimesheetByDate,
  saveTimesheetByDate,
  sendOutTimesheets,
  getSubmissionStatusByRange,
  getAllSubmittedTimesheets,
  getRecentTimesheets,
} = require('../controllers/timesheetController');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/recent', requireRoles('staff'), getRecentTimesheets);
router.get('/period/:date', requireRoles('staff'), getTimesheetByDate);
router.post(
  '/period/:date',
  requireRoles('staff'),
  [
    body('entries').isArray({ min: 1 }).withMessage('Entries must contain at least 1 row'),
    body('entries.*.date').notEmpty().withMessage('Each entry must have a date'),
    body('entries.*.entryType').optional().isString().withMessage('Entry type must be text'),
    body('entries.*.hours').optional().isFloat({ min: 0 }).withMessage('Hours must be 0 or higher'),
    body('entries.*.overtimeHours')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Overtime hours must be 0 or higher'),
    body('entries.*.notes').optional().isString(),
    body('customTypes').optional().isArray(),
    body('customTypes.*').optional().isString(),
    body('submit').optional().isBoolean(),
  ],
  saveTimesheetByDate
);

router.post(
  '/dispatch/send-out',
  requireRoles('dispatcher'),
  [
    body('periodFrom').isISO8601().withMessage('periodFrom must be a valid date'),
    body('periodTo').isISO8601().withMessage('periodTo must be a valid date'),
  ],
  sendOutTimesheets
);

router.get('/dispatch/status', requireRoles('dispatcher', 'admin'), getSubmissionStatusByRange);
router.get('/admin/submitted', requireRoles('admin'), getAllSubmittedTimesheets);

module.exports = router;
