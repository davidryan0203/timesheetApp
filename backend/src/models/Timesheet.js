const mongoose = require('mongoose');

const timesheetEntrySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    entryType: {
      type: String,
      default: 'Regular Hours',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
    },
    hours: {
      type: Number,
      default: 0,
      min: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const timesheetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    distributedAt: {
      type: Date,
      default: null,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    entries: {
      type: [timesheetEntrySchema],
      default: [],
    },
    customTypes: {
      type: [String],
      default: [],
    },
    totalHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_manager', 'manager_approved', 'manager_rejected', 'pending_ceo', 'ceo_approved', 'ceo_rejected', 'hr_head_approved', 'hr_head_rejected'],
      default: 'draft',
      index: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    managerReviewedAt: {
      type: Date,
      default: null,
    },
    managerComment: {
      type: String,
      default: '',
      trim: true,
    },
    ceo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    ceoReviewedAt: {
      type: Date,
      default: null,
    },
    ceoComment: {
      type: String,
      default: '',
      trim: true,
    },
    hrHeadReviewedAt: {
      type: Date,
      default: null,
    },
    hrHeadComment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

timesheetSchema.index({ user: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

module.exports = mongoose.model('Timesheet', timesheetSchema);
