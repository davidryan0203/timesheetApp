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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
