/**
 * Database Connection Utility
 *
 * Handles database connection for MongoDB or PostgreSQL
 */

const mongoose = require("mongoose");
const config = require("../config");
const logger = require("./logger");

let isConnected = false;

async function connectDatabase() {
  if (isConnected) {
    logger.info("Using existing database connection");
    return;
  }

  const dbUrl = config.database.url;

  // Determine database type from URL
  if (dbUrl.startsWith("mongodb")) {
    return connectMongoDB();
  } else if (dbUrl.startsWith("postgres")) {
    return connectPostgreSQL();
  } else {
    throw new Error("Unsupported database type. Use MongoDB or PostgreSQL.");
  }
}

async function connectMongoDB() {
  try {
    await mongoose.connect(config.database.url, config.database.options);

    mongoose.connection.on("connected", () => {
      logger.info("MongoDB connected successfully");
      isConnected = true;
    });

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
      isConnected = false;
    });

    // Load models
    require("../models/wallet");
    require("../models/transaction");
    require("../models/refund");
    require("../models/agent");

    return mongoose.connection;
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

async function connectPostgreSQL() {
  const { Pool } = require("pg");

  try {
    const pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    logger.info("PostgreSQL connected successfully");
    client.release();

    isConnected = true;
    return pool;
  } catch (error) {
    logger.error("Failed to connect to PostgreSQL:", error);
    throw error;
  }
}

async function disconnectDatabase() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.connection.close();
    logger.info("Database disconnected");
    isConnected = false;
  } catch (error) {
    logger.error("Error disconnecting database:", error);
    throw error;
  }
}

const { Wallet } = require("../models/wallet");
const { Transaction } = require("../models/transaction");
const { Refund } = require("../models/refund");
const { Agent } = require("../models/agent");

module.exports = {
  connectDatabase,
  disconnectDatabase,
  isConnected: () => isConnected,
  Wallet,
  Transaction,
  Refund,
  Agent,

  // Repository Methods (MongoDB Implementation)
  async findWalletById(id) {
    return Wallet.findById(id);
  },

  async findWalletByUserId(userId) {
    return Wallet.findOne({ userId });
  },

  async createWallet(walletData) {
    return Wallet.create(walletData);
  },

  async updateWalletBalance(walletId, amount) {
    return Wallet.findByIdAndUpdate(
      walletId,
      { $inc: { balance: amount } },
      { new: true, runValidators: true },
    );
  },

  async updateWallet(walletId, updateData) {
    return Wallet.findByIdAndUpdate(walletId, updateData, { new: true });
  },

  async createTransaction(transactionData) {
    return Transaction.create(transactionData);
  },

  async updateTransaction(transactionId, updateData) {
    return Transaction.findByIdAndUpdate(transactionId, updateData, {
      new: true,
    });
  },

  async findTransactions(query) {
    const {
      walletId,
      type,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;
    const filter = { walletId };
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;
    const items = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(filter);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getWalletStatistics(walletId) {
    const stats = await Transaction.aggregate([
      { $match: { walletId, status: "completed" } },
      {
        $group: {
          _id: null,
          totalCredits: {
            $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
          },
          totalDebits: {
            $sum: {
              $cond: [{ $eq: ["$type", "debit"] }, { $abs: "$amount" }, 0],
            },
          },
          transactionCount: { $sum: 1 },
          averageTransaction: { $avg: { $abs: "$amount" } },
        },
      },
    ]);

    const lastTransaction = await Transaction.findOne({
      walletId,
      status: "completed",
    }).sort({ createdAt: -1 });

    return {
      ...(stats[0] || {}),
      lastTransaction,
    };
  },

  // Agent Repository Methods
  async findAgentById(id) {
    return Agent.findById(id);
  },

  async findAgentByWalletId(walletId) {
    return Agent.findOne({ walletId });
  },

  async createAgent(agentData) {
    return Agent.create(agentData);
  },

  async updateAgent(agentId, updateData) {
    return Agent.findByIdAndUpdate(agentId, updateData, { new: true });
  },

  async findAllAgents(filter = {}) {
    return Agent.find(filter);
  },
};
