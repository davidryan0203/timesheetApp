const express = require('express');
const { body } = require('express-validator');
const {
  getTimesheetByDate,
  saveTimesheetByDate,
  sendOutTimesheets,
  getSubmissionStatusByRange,
  getLatestDispatchedPeriod,
  getAllSubmittedTimesheets,
  getPrintableTimesheets,
  getRecentTimesheets,
  getManagerApprovalQueue,
  managerReviewTimesheet,
  getCeoReviewQueue,
  ceoReviewTimesheet,
  getHrReviewQueue,
  getHrHeadReviewQueue,
  hrHeadReviewTimesheet,
} = require('../controllers/timesheetController');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/recent', requireRoles('staff', 'manager'), getRecentTimesheets);
router.get('/period/:date', requireRoles('staff', 'manager'), getTimesheetByDate);
router.post(
  '/period/:date',
  requireRoles('staff', 'manager'),
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
  requireRoles('hr'),
  [
    body('periodFrom').isISO8601().withMessage('periodFrom must be a valid date'),
    body('periodTo').isISO8601().withMessage('periodTo must be a valid date'),
  ],
  sendOutTimesheets
);

router.get('/dispatch/status', requireRoles('hr', 'admin'), getSubmissionStatusByRange);
router.get('/dispatch/latest-period', requireRoles('hr', 'admin'), getLatestDispatchedPeriod);
router.get('/printable', requireRoles('hr', 'admin', 'payroll'), getPrintableTimesheets);
router.get('/manager/pending', requireRoles('manager'), getManagerApprovalQueue);
router.post(
  '/manager/review/:id',
  requireRoles('manager'),
  [
    body('decision').isIn(['approve', 'reject']).withMessage('decision must be approve or reject'),
    body('comment').optional().isString().withMessage('comment must be text'),
  ],
  managerReviewTimesheet
);

router.get('/ceo/pending', requireRoles('ceo'), getCeoReviewQueue);
router.post(
  '/ceo/review/:id',
  requireRoles('ceo'),
  [
    body('decision').isIn(['approve', 'reject']).withMessage('decision must be approve or reject'),
    body('comment').optional().isString().withMessage('comment must be text'),
  ],
  ceoReviewTimesheet
);

router.get('/hr/pending', requireRoles('hr', 'admin'), getHrReviewQueue);
router.get('/hr-head/pending', requireRoles('hr_head'), getHrHeadReviewQueue);
router.post(
  '/hr-head/review/:id',
  requireRoles('hr_head'),
  [
    body('decision').isIn(['approve', 'reject']).withMessage('decision must be approve or reject'),
    body('comment').optional().isString().withMessage('comment must be text'),
  ],
  hrHeadReviewTimesheet
);
router.get('/admin/submitted', requireRoles('admin', 'payroll'), getAllSubmittedTimesheets);

module.exports = router;
