/**
 * Refund Model
 *
 * Database schema for refund requests and processing.
 */

const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
    },
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected", "completed", "failed"],
      default: "pending",
      index: true,
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "customer_request",
        "duplicate_charge",
        "fraudulent",
        "service_issue",
        "other",
      ],
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    requestedBy: {
      userId: String,
      role: String,
      name: String,
    },
    approvedBy: {
      adminId: String,
      name: String,
    },
    rejectedBy: {
      adminId: String,
      name: String,
      reason: String,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "refunds",
  },
);

// Indexes
refundSchema.index({ walletId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

// Virtual for refund ID
refundSchema.virtual("id").get(function () {
  return this._id.toString();
});

refundSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Instance methods
refundSchema.methods.approve = function (adminId, adminName) {
  this.status = "approved";
  this.approvedBy = { adminId, name: adminName };
  this.approvedAt = new Date();
};

refundSchema.methods.reject = function (adminId, adminName, reason) {
  this.status = "rejected";
  this.rejectedBy = { adminId, name: adminName, reason };
  this.rejectedAt = new Date();
};

refundSchema.methods.markCompleted = function () {
  this.status = "completed";
  this.completedAt = new Date();
};

refundSchema.methods.markFailed = function (errorMessage) {
  this.status = "failed";
  this.errorMessage = errorMessage;
  this.failedAt = new Date();
};

// Static methods
refundSchema.statics.findPending = function (options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  return this.find({ status: "pending" })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

refundSchema.statics.findByWallet = function (walletId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const skip = (page - 1) * limit;

  const query = { walletId };
  if (status) query.status = status;

  return this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

refundSchema.statics.getStats = async function (dateFrom, dateTo) {
  const matchQuery = {};

  if (dateFrom || dateTo) {
    matchQuery.createdAt = {};
    if (dateFrom) matchQuery.createdAt.$gte = new Date(dateFrom);
    if (dateTo) matchQuery.createdAt.$lte = new Date(dateTo);
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalAmount: stat.totalAmount,
    };
    return acc;
  }, {});
};

// PostgreSQL schema
const postgresqlSchema = `
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(255) NOT NULL,
  wallet_id VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  reason VARCHAR(50) NOT NULL
    CHECK (reason IN ('customer_request', 'duplicate_charge', 'fraudulent', 'service_issue', 'other')),
  notes TEXT,
  requested_by JSONB,
  approved_by JSONB,
  rejected_by JSONB,
  metadata JSONB DEFAULT '{}',
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX idx_refunds_wallet_id ON refunds(wallet_id);
CREATE INDEX idx_refunds_status ON refunds(status, created_at DESC);

CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const Refund = mongoose.model("Refund", refundSchema);

module.exports = {
  Refund,
  refundSchema,
  postgresqlSchema,
};
