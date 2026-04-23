const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  me,
  listManagers,
  listCeos,
  createUserByAdmin,
  listUsersForAdmin,
  requestPasswordResetByAdmin,
  resetPasswordWithToken,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/roleMiddleware');

const router = express.Router();

const normalizeRegisterBody = (req, _res, next) => {
  const nestedPayload = req.body?.name;
  if (!nestedPayload || typeof nestedPayload !== 'object' || Array.isArray(nestedPayload)) {
    return next();
  }

  req.body = {
    ...req.body,
    name: typeof req.body.name === 'string' ? req.body.name : nestedPayload.name,
    email: req.body.email || nestedPayload.email,
    password: req.body.password || nestedPayload.password,
    role: req.body.role || nestedPayload.role,
    managerId: req.body.managerId || nestedPayload.managerId || nestedPayload.manager || nestedPayload.assignedManagerId,
  };

  return next();
};

router.post(
  '/register',
  normalizeRegisterBody,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('role')
      .optional()
      .isIn(['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll'])
      .withMessage('Role must be admin, hr, manager, staff, ceo, hr_head, or payroll'),
    body('managerId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('managerId must be a valid user id'),
    body('manager')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('manager must be a valid user id'),
    body('assignedManagerId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('assignedManagerId must be a valid user id'),
  ],
  register
);

router.post(
  '/admin/create-user',
  authMiddleware,
  requireRoles('admin'),
  normalizeRegisterBody,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('role')
      .optional()
      .isIn(['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll'])
      .withMessage('Role must be admin, hr, manager, staff, ceo, hr_head, or payroll'),
    body('managerId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('managerId must be a valid user id'),
    body('manager')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('manager must be a valid user id'),
    body('assignedManagerId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('assignedManagerId must be a valid user id'),
  ],
  createUserByAdmin
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.post(
  '/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('confirmPassword')
      .isLength({ min: 6 })
      .withMessage('Confirm password must be at least 6 characters long'),
  ],
  resetPasswordWithToken
);

router.get('/me', authMiddleware, me);
router.get('/managers', listManagers);
router.get('/ceos', listCeos);
router.get('/admin/users', authMiddleware, requireRoles('admin'), listUsersForAdmin);
router.post(
  '/admin/request-password-reset',
  authMiddleware,
  requireRoles('admin'),
  [body('userId').isMongoId().withMessage('userId must be a valid user id')],
  requestPasswordResetByAdmin
);

module.exports = router;
