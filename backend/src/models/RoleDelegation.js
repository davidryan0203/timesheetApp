const mongoose = require('mongoose');

const roleDelegationSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    delegatedRole: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll', 'dispatcher'],
      required: true,
    },
    delegatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    startDate: {
      type: Date,
      default: () => new Date(),
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('RoleDelegation', roleDelegationSchema);
