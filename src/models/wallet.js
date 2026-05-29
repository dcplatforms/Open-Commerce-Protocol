/**
 * Wallet Model
 *
 * Database schema and operations for wallet management.
 * Compatible with both MongoDB and PostgreSQL through adapter pattern.
 */

const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "closed"],
      default: "active",
      index: true,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paymentMethods: [
      {
        tokenId: String,
        type: {
          type: String,
          enum: ["card", "apple_pay", "google_pay"],
        },
        last4: String,
        brand: String,
        isDefault: Boolean,
        createdAt: Date,
      },
    ],
    settings: {
      autoTopUp: {
        enabled: { type: Boolean, default: false },
        threshold: { type: Number, default: 10 },
        amount: { type: Number, default: 50 },
        paymentMethodId: String,
      },
      notifications: {
        lowBalance: { type: Boolean, default: true },
        transactions: { type: Boolean, default: true },
      },
    },
  },
  {
    timestamps: true,
    collection: "wallets",
  },
);

// Indexes for performance
walletSchema.index({ createdAt: -1 });
walletSchema.index({ status: 1, balance: 1 });

// Virtual for wallet ID
walletSchema.virtual("id").get(function () {
  return this._id.toString();
});

// Ensure virtuals are included in JSON
walletSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Instance methods
walletSchema.methods.isActive = function () {
  return this.status === "active";
};

walletSchema.methods.canDeduct = function (amount) {
  return this.isActive() && this.balance >= amount;
};

walletSchema.methods.addPaymentMethod = function (
  tokenId,
  type,
  metadata = {},
) {
  this.paymentMethods.push({
    tokenId,
    type,
    last4: metadata.last4,
    brand: metadata.brand,
    isDefault: this.paymentMethods.length === 0,
    createdAt: new Date(),
  });
};

walletSchema.methods.removePaymentMethod = function (tokenId) {
  this.paymentMethods = this.paymentMethods.filter(
    (pm) => pm.tokenId !== tokenId,
  );
};

walletSchema.methods.setDefaultPaymentMethod = function (tokenId) {
  this.paymentMethods.forEach((pm) => {
    pm.isDefault = pm.tokenId === tokenId;
  });
};

// Static methods
walletSchema.statics.findByUserId = function (userId) {
  return this.findOne({ userId });
};

walletSchema.statics.findActiveWallets = function (options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  return this.find({ status: "active" })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

walletSchema.statics.getTotalBalance = async function () {
  const result = await this.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: null, total: { $sum: "$balance" } } },
  ]);
  return result[0]?.total || 0;
};

walletSchema.statics.getWalletStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalBalance: { $sum: "$balance" },
        avgBalance: { $avg: "$balance" },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalBalance: stat.totalBalance,
      avgBalance: stat.avgBalance,
    };
    return acc;
  }, {});
};

// Pre-save middleware
walletSchema.pre("save", function (next) {
  // Ensure balance doesn't go negative
  if (this.balance < 0) {
    return next(new Error("Wallet balance cannot be negative"));
  }
  next();
});

// PostgreSQL alternative schema (for reference)
const postgresqlSchema = `
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  metadata JSONB DEFAULT '{}',
  payment_methods JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_status ON wallets(status);
CREATE INDEX idx_wallets_created_at ON wallets(created_at DESC);
CREATE INDEX idx_wallets_status_balance ON wallets(status, balance);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = {
  Wallet,
  walletSchema,
  postgresqlSchema, // For PostgreSQL users
};
