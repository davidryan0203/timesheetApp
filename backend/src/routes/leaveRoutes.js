const express = require('express');
const { body } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');
const {
  getMyLeaveBalances,
  getLeaveBalancesByUser,
  updateLeaveBalances,
} = require('../controllers/leaveController');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', getMyLeaveBalances);
router.get('/user/:userId', requireRoles('admin', 'hr', 'hr_head'), getLeaveBalancesByUser);
router.patch(
  '/user/:userId',
  requireRoles('admin', 'hr', 'hr_head'),
  [
    body('annualLeave').optional().isFloat({ min: 0 }).withMessage('annualLeave must be >= 0'),
    body('sickLeave').optional().isFloat({ min: 0 }).withMessage('sickLeave must be >= 0'),
    body('timeInLieu').optional().isFloat({ min: 0 }).withMessage('timeInLieu must be >= 0'),
    body('discretionaryLeave')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('discretionaryLeave must be >= 0'),
    body('nonDiscretionaryLeave')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('nonDiscretionaryLeave must be >= 0'),
  ],
  updateLeaveBalances
);

module.exports = router;
