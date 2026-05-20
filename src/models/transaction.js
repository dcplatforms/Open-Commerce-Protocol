/**
 * Transaction Model
 *
 * Database schema for transaction records with complete audit trail.
 */

const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "credit",
        "debit",
        "transfer_in",
        "transfer_out",
        "refund",
        "a2a_transfer",
        "blockchain_transfer",
      ],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    paymentToken: {
      type: String,
      sparse: true,
    },
    transferId: {
      type: String,
      sparse: true,
    },
    refundId: {
      type: String,
      sparse: true,
      index: true,
    },
    agentId: {
      type: String,
      sparse: true,
      index: true,
    },
    counterpartyAgentId: {
      type: String,
      sparse: true,
      index: true,
    },
    ucpPayload: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    hash: {
      type: String,
      sparse: true,
      index: true,
    },
    network: {
      type: String,
      sparse: true,
    },
    gasUsed: {
      type: Number,
      sparse: true,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    balanceAfter: {
      type: Number,
    },
    errorMessage: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "transactions",
  },
);

// Indexes for common queries
transactionSchema.index({ walletId: 1, createdAt: -1 });
transactionSchema.index({ walletId: 1, type: 1 });
transactionSchema.index({ walletId: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

// Virtual for transaction ID
transactionSchema.virtual("id").get(function () {
  return this._id.toString();
});

// Ensure virtuals are included in JSON
transactionSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Instance methods
transactionSchema.methods.isCompleted = function () {
  return this.status === "completed";
};

transactionSchema.methods.isPending = function () {
  return this.status === "pending";
};

transactionSchema.methods.markCompleted = function () {
  this.status = "completed";
  this.completedAt = new Date();
};

transactionSchema.methods.markFailed = function (errorMessage) {
  this.status = "failed";
  this.errorMessage = errorMessage;
  this.failedAt = new Date();
};

// Static methods
transactionSchema.statics.findByWallet = function (walletId, options = {}) {
  const { page = 1, limit = 20, type, status } = options;
  const skip = (page - 1) * limit;

  const query = { walletId };
  if (type) query.type = type;
  if (status) query.status = status;

  return this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

transactionSchema.statics.findByTransfer = function (transferId) {
  return this.find({ transferId });
};

transactionSchema.statics.getWalletStats = async function (
  walletId,
  dateFrom,
  dateTo,
) {
  const matchQuery = { walletId, status: "completed" };

  if (dateFrom || dateTo) {
    matchQuery.completedAt = {};
    if (dateFrom) matchQuery.completedAt.$gte = new Date(dateFrom);
    if (dateTo) matchQuery.completedAt.$lte = new Date(dateTo);
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgAmount: { $avg: "$amount" },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalAmount: stat.totalAmount,
      avgAmount: stat.avgAmount,
    };
    return acc;
  }, {});
};

transactionSchema.statics.getRecentActivity = function (limit = 10) {
  return this.find({ status: "completed" })
    .sort({ completedAt: -1 })
    .limit(limit);
};

transactionSchema.statics.getVolumeByPeriod = async function (period = "day") {
  const groupBy =
    period === "day"
      ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
      : { $dateToString: { format: "%Y-%m", date: "$createdAt" } };

  return this.aggregate([
    { $match: { status: "completed" } },
    {
      $group: {
        _id: groupBy,
        count: { $sum: 1 },
        volume: { $sum: { $abs: "$amount" } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

// PostgreSQL alternative schema
const postgresqlSchema = `
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit', 'transfer_in', 'transfer_out', 'refund')),
  amount DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  description TEXT NOT NULL,
  payment_token VARCHAR(255),
  transfer_id VARCHAR(255),
  refund_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  balance_after DECIMAL(12, 2),
  error_message TEXT,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_wallet_created ON transactions(wallet_id, created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_transfer_id ON transactions(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = {
  Transaction,
  transactionSchema,
  postgresqlSchema,
};
