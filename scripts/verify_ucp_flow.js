const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WalletService, A2AService, UCPService } = require('../src/services');
const { Agent } = require('../src/models/agent');
const { Transaction } = require('../src/models/transaction');
const { Wallet } = require('../src/models/wallet');

// Mock DB wrapper for WalletService since it expects a db object with models attached
// or methods.
class DBAdapter {
    constructor() {
        this.Wallet = Wallet;
        this.Transaction = Transaction;
        this.Agent = Agent;
    }

    async findWalletById(id) { return Wallet.findById(id); }
    async findWalletByUserId(userId) { return Wallet.findOne({ userId }); }
    async createWallet(data) { return Wallet.create(data); }
    async createTransaction(data) { return Transaction.create(data); }
    async updateTransaction(id, data) { return Transaction.findByIdAndUpdate(id, data, { new: true }); }
    async findAgentById(id) { return Agent.findById(id); }

    async updateWalletBalance(walletId, amount) {
        return Wallet.findByIdAndUpdate(walletId, { $inc: { balance: amount } }, { new: true });
    }

    async findTransactions(query) { return Transaction.find(query); }
}

async function verify() {
    let mongod;
    try {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);

        console.log('Connected to in-memory DB');

        const dbAdapter = new DBAdapter();
        const walletService = new WalletService(dbAdapter);
        const a2aService = new A2AService(walletService, dbAdapter);
        const ucpService = new UCPService(a2aService);

        // 1. Setup Data
        console.log('Setting up test data...');
        const wallet1 = await walletService.createWallet({ userId: 'user1', currency: 'USD', initialBalance: 1000 });
        const wallet2 = await walletService.createWallet({ userId: 'user2', currency: 'USD', initialBalance: 0 });

        const agent1 = await Agent.create({
            name: 'Buyer Agent',
            ownerId: 'user1',
            walletId: wallet1.id,
            status: 'active',
            config: { limits: { perTransaction: 500 } }
        });

        const agent2 = await Agent.create({
            name: 'Seller Agent',
            ownerId: 'user2',
            walletId: wallet2.id,
            status: 'active'
        });

        console.log(`Agent1: ${agent1.id} (Wallet: ${wallet1.id}, Balance: 1000)`);
        console.log(`Agent2: ${agent2.id} (Wallet: ${wallet2.id}, Balance: 0)`);

        // 2. Execute UCP Transfer
        console.log('Executing UCP Transfer...');
        const ucpPayload = {
            ver: '1.0',
            intent: 'transfer',
            sender: { agent_id: agent1.id },
            recipient: { agent_id: agent2.id },
            amount: { value: 150, currency: 'USD' }
        };

        const result = await ucpService.processPayload(ucpPayload);
        console.log('Transfer Result:', result);

        // 3. Verify Balances
        const updatedWallet1 = await walletService.getWallet(wallet1.id);
        const updatedWallet2 = await walletService.getWallet(wallet2.id);

        console.log(`Wallet1 New Balance: ${updatedWallet1.balance}`);
        console.log(`Wallet2 New Balance: ${updatedWallet2.balance}`);

        if (updatedWallet1.balance !== 850) throw new Error('Wallet1 balance incorrect');
        if (updatedWallet2.balance !== 150) throw new Error('Wallet2 balance incorrect');

        // 4. Verify Transaction Record
        const txs = await Transaction.find({ 'ucpPayload.sender.agent_id': agent1.id });
        if (txs.length === 0) throw new Error('Transaction record not found');
        console.log('Transaction Verified:', txs[0].id);

        console.log('VERIFICATION SUCCESSFUL');

    } catch (error) {
        console.error('VERIFICATION FAILED:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    }
}

verify();
