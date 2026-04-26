const express = require('express');
const { body, query } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');
const {
  getAvailableRoles,
  switchActiveRole,
  createDelegation,
  listDelegations,
  revokeDelegation,
} = require('../controllers/delegationController');

const router = express.Router();

router.use(authMiddleware);

router.get('/roles/available', getAvailableRoles);
router.post(
  '/roles/switch',
  [
    body('role')
      .isIn(['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll', 'dispatcher'])
      .withMessage('Invalid role'),
  ],
  switchActiveRole
);

router.get(
  '/',
  requireRoles('admin'),
  [
    query('status').optional().isIn(['active', 'expired', 'revoked']).withMessage('Invalid status'),
    query('staffId').optional().isMongoId().withMessage('staffId must be a valid id'),
  ],
  listDelegations
);

router.post(
  '/',
  requireRoles('admin'),
  [
    body('staffId').isMongoId().withMessage('staffId must be a valid id'),
    body('delegatedRole')
      .isIn(['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll', 'dispatcher'])
      .withMessage('Invalid delegated role'),
    body('reason').optional().isString().withMessage('reason must be text'),
    body('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
    body('endDate').optional().isISO8601().withMessage('endDate must be a valid date'),
  ],
  createDelegation
);

router.patch('/:id/revoke', requireRoles('admin'), revokeDelegation);

module.exports = router;
