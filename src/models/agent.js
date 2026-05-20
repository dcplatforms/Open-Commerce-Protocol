/**
 * Agent Model
 *
 * Database schema for AI Agents with customization and autonomous capabilities.
 */

const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    walletId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["personal", "business", "service"],
      default: "personal",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true,
    },
    config: {
      limits: {
        daily: { type: Number, default: 0 }, // 0 = unlimited
        perTransaction: { type: Number, default: 0 },
      },
      allowedCategories: [
        {
          type: String,
        },
      ],
      authorizedCounterparties: [
        {
          type: String, // Agent IDs
        },
      ],
      autoApprove: {
        type: Boolean,
        default: false,
      },
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "agents",
  },
);

// Indexes
agentSchema.index({ ownerId: 1, status: 1 });

const Agent = mongoose.model("Agent", agentSchema);

module.exports = {
  Agent,
  agentSchema,
};
