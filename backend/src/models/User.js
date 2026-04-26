const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll', 'dispatcher'],
      default: 'staff',
      index: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    resetPasswordTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    resetPasswordTokenExpiresAt: {
      type: Date,
      default: null,
    },
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    leaveBalances: {
      annualLeave: {
        type: Number,
        default: 15,
        min: 0,
      },
      sickLeave: {
        type: Number,
        default: 21,
        min: 0,
      },
      timeInLieu: {
        type: Number,
        default: 0,
        min: 0,
      },
      discretionaryLeave: {
        type: Number,
        default: 3,
        min: 0,
      },
      nonDiscretionaryLeave: {
        type: Number,
        default: 3,
        min: 0,
      },
    },
    delegatedRoles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RoleDelegation',
      },
    ],
    activeRole: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'staff', 'ceo', 'hr_head', 'payroll', 'dispatcher'],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
