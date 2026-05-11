/**
 * Wallet Service
 *
 * Core business logic for wallet operations including balance management,
 * transaction processing, and wallet lifecycle management.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class WalletService {
  constructor(database, config = {}) {
    this.db = database;
    this.config = {
      defaultCurrency: config.defaultCurrency || 'USD',
      minBalance: config.minBalance || 0,
      maxBalance: config.maxBalance || 10000,
      autoTopUp: config.autoTopUp || {
        enabled: false,
        threshold: 10,
        amount: 50
      }
    };
  }

  /**
   * Create a new wallet
   * @param {Object} params - Wallet creation parameters
   * @param {string} params.userId - User identifier
   * @param {string} params.currency - Currency code (default: USD)
   * @param {number} params.initialBalance - Initial balance (default: 0)
   * @returns {Promise<Object>} Created wallet
   */
  async createWallet({ userId, currency, initialBalance = 0 }) {
    try {
      // Check if user already has a wallet
      const existingWallet = await this.db.findWalletByUserId(userId);
      if (existingWallet) {
        throw new Error('User already has a wallet');
      }

      // Validate initial balance
      if (initialBalance < this.config.minBalance) {
        throw new Error(`Initial balance must be at least ${this.config.minBalance}`);
      }

      if (initialBalance > this.config.maxBalance) {
        throw new Error(`Initial balance cannot exceed ${this.config.maxBalance}`);
      }

      // Create wallet
      const wallet = await this.db.createWallet({
        userId,
        balance: initialBalance,
        currency: currency || this.config.defaultCurrency,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Create initial transaction if balance > 0
      if (initialBalance > 0) {
        await this.db.createTransaction({
          walletId: wallet.id,
          type: 'credit',
          amount: initialBalance,
          description: 'Initial wallet funding',
          status: 'completed',
          metadata: { source: 'wallet_creation' },
          createdAt: new Date()
        });
      }

      return wallet;
    } catch (error) {
      throw this._handleError('createWallet', error);
    }
  }

  /**
   * Get wallet by ID
   * @param {string} walletId - Wallet identifier
   * @returns {Promise<Object>} Wallet object
   */
  async getWallet(walletId) {
    try {
      const wallet = await this.db.findWalletById(walletId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      return wallet;
    } catch (error) {
      throw this._handleError('getWallet', error);
    }
  }

  /**
   * Get wallet by user ID
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Wallet object
   */
  async getWalletByUserId(userId) {
    try {
      const wallet = await this.db.findWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }
      return wallet;
    } catch (error) {
      throw this._handleError('getWalletByUserId', error);
    }
  }

  /**
   * Add funds to a wallet
   * @param {Object} params - Funding parameters
   * @param {string} params.walletId - Wallet identifier
   * @param {number} params.amount - Amount to add
   * @param {string} params.paymentToken - Payment token from tokenization service
   * @param {string} params.description - Transaction description
   * @param {Object} params.metadata - Optional metadata
   * @returns {Promise<Object>} Transaction result
   */
  async addFunds({ walletId, amount, paymentToken, description, metadata = {} }) {
    try {
      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Get wallet
      const wallet = await this.getWallet(walletId);
      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      // Check if new balance would exceed max
      const newBalance = wallet.balance + amount;
      if (newBalance > this.config.maxBalance) {
        throw new Error(`Balance would exceed maximum of ${this.config.maxBalance}`);
      }

      // Extract top-level fields from metadata if they exist
      const { agentId, counterpartyAgentId, ucpPayload, ...restMetadata } = metadata;

      // Create transaction
      const transaction = await this.db.createTransaction({
        walletId,
        type: 'credit',
        amount,
        description: description || 'Add funds',
        status: 'pending',
        paymentToken,
        agentId,
        counterpartyAgentId,
        ucpPayload,
        metadata: {
          ...restMetadata,
          previous_balance: wallet.balance,
          new_balance: newBalance
        },
        createdAt: new Date()
      });

      // Update wallet balance atomically
      await this.db.updateWalletBalance(walletId, amount);

      // Update transaction status
      await this.db.updateTransaction(transaction.id, {
        status: 'completed',
        completedAt: new Date()
      });

      return {
        transactionId: transaction.id,
        amount,
        newBalance,
        status: 'completed'
      };
    } catch (error) {
      throw this._handleError('addFunds', error);
    }
  }

  /**
   * Deduct funds from a wallet
   * @param {Object} params - Deduction parameters
   * @param {string} params.walletId - Wallet identifier
   * @param {number} params.amount - Amount to deduct
   * @param {string} params.description - Transaction description
   * @param {Object} params.metadata - Optional metadata
   * @returns {Promise<Object>} Transaction result
   */
  async deductFunds({ walletId, amount, description, metadata = {} }) {
    try {
      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Get wallet
      const wallet = await this.getWallet(walletId);
      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      const newBalance = wallet.balance - amount;

      // Extract top-level fields from metadata if they exist
      const { agentId, counterpartyAgentId, ucpPayload, ...restMetadata } = metadata;

      // Create transaction
      const transaction = await this.db.createTransaction({
        walletId,
        type: 'debit',
        amount: -amount,
        description: description || 'Payment',
        status: 'pending',
        agentId,
        counterpartyAgentId,
        ucpPayload,
        metadata: {
          ...restMetadata,
          previous_balance: wallet.balance,
          new_balance: newBalance
        },
        createdAt: new Date()
      });

      // Update wallet balance atomically
      await this.db.updateWalletBalance(walletId, -amount);

      // Update transaction status
      await this.db.updateTransaction(transaction.id, {
        status: 'completed',
        completedAt: new Date()
      });

      // Check if auto top-up is needed
      if (this.config.autoTopUp.enabled && newBalance < this.config.autoTopUp.threshold) {
        await this._triggerAutoTopUp(walletId, newBalance);
      }

      return {
        transactionId: transaction.id,
        amount: -amount,
        newBalance,
        status: 'completed'
      };
    } catch (error) {
      throw this._handleError('deductFunds', error);
    }
  }

  /**
   * Transfer funds between wallets
   * @param {Object} params - Transfer parameters
   * @param {string} params.fromWalletId - Source wallet ID
   * @param {string} params.toWalletId - Destination wallet ID
   * @param {number} params.amount - Amount to transfer
   * @param {string} params.description - Transfer description
   * @returns {Promise<Object>} Transfer result
   */
  async transfer({ fromWalletId, toWalletId, amount, description, metadata = {} }) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (fromWalletId === toWalletId) {
        throw new Error('Cannot transfer to same wallet');
      }

      // Start transaction
      const transferId = this._generateTransferId();

      // Deduct from source wallet
      const debit = await this.deductFunds({
        walletId: fromWalletId,
        amount,
        description: description || `Transfer to wallet ${toWalletId}`,
        metadata: { ...metadata, transfer_id: transferId, type: 'transfer_out' }
      });

      // Add to destination wallet
      const credit = await this.addFunds({
        walletId: toWalletId,
        amount,
        paymentToken: null,
        description: description || `Transfer from wallet ${fromWalletId}`,
        metadata: { ...metadata, transfer_id: transferId, type: 'transfer_in' }
      });

      return {
        transferId,
        fromWalletId,
        toWalletId,
        amount,
        debitTransactionId: debit.transactionId,
        creditTransactionId: credit.transactionId,
        status: 'completed'
      };
    } catch (error) {
      throw this._handleError('transfer', error);
    }
  }

  /**
   * Get transaction history
   * @param {string} walletId - Wallet identifier
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Transaction history with pagination
   */
  async getTransactions(walletId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        type = null,
        status = null,
        dateFrom = null,
        dateTo = null
      } = options;

      const result = await this.db.findTransactions({
        walletId,
        type,
        status,
        dateFrom,
        dateTo,
        page,
        limit
      });

      return result;
    } catch (error) {
      throw this._handleError('getTransactions', error);
    }
  }

  /**
   * Update wallet status
   * @param {string} walletId - Wallet identifier
   * @param {string} status - New status (active, suspended, closed)
   * @returns {Promise<Object>} Updated wallet
   */
  async updateWalletStatus(walletId, status) {
    try {
      const validStatuses = ['active', 'suspended', 'closed'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const wallet = await this.getWallet(walletId);

      await this.db.updateWallet(walletId, {
        status,
        updatedAt: new Date()
      });

      return { ...wallet, status };
    } catch (error) {
      throw this._handleError('updateWalletStatus', error);
    }
  }

  /**
   * Get wallet statistics
   * @param {string} walletId - Wallet identifier
   * @returns {Promise<Object>} Wallet statistics
   */
  async getWalletStats(walletId) {
    try {
      const wallet = await this.getWallet(walletId);
      const stats = await this.db.getWalletStatistics(walletId);

      return {
        walletId,
        currentBalance: wallet.balance,
        currency: wallet.currency,
        totalCredits: stats.totalCredits || 0,
        totalDebits: stats.totalDebits || 0,
        transactionCount: stats.transactionCount || 0,
        averageTransaction: stats.averageTransaction || 0,
        lastTransaction: stats.lastTransaction || null
      };
    } catch (error) {
      throw this._handleError('getWalletStats', error);
    }
  }

  /**
   * Trigger auto top-up for wallet
   * @private
   */
  async _triggerAutoTopUp(walletId, currentBalance) {
    try {
      // This would integrate with a stored payment method
      // For now, just log the event
      logger.info(`Auto top-up triggered for wallet ${walletId}. Current balance: ${currentBalance}`);

      // You would implement actual top-up logic here
      // Example: await this.addFunds({ walletId, amount: this.config.autoTopUp.amount, ... });
    } catch (error) {
      logger.error('Auto top-up failed:', error);
    }
  }

  /**
   * Generate unique transfer ID
   * @private
   */
  _generateTransferId() {
    return `transfer_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Handle and format errors
   * @private
   */
  _handleError(method, error) {
    logger.error(`WalletService.${method} error:`, error);
    return error instanceof Error ? error : new Error(error);
  }
}

module.exports = WalletService;
