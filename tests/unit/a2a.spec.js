const A2AService = require('../../src/services/a2aService');

describe('A2AService', () => {
  let a2aService;
  let mockWalletService;
  let mockDb;

  beforeEach(() => {
    mockWalletService = {
      transfer: jest.fn(),
    };
    mockDb = {
      findAgentById: jest.fn(),
    };
    a2aService = new A2AService(mockWalletService, mockDb);
  });

  describe('executeTransfer', () => {
    it('should successfully execute a transfer between two active agents', async () => {
      const fromAgent = {
        id: 'agent1',
        name: 'Sender',
        status: 'active',
        walletId: 'wallet1',
        config: { limits: { perTransaction: 1000 } }
      };
      const toAgent = {
        id: 'agent2',
        name: 'Recipient',
        status: 'active',
        walletId: 'wallet2'
      };

      mockDb.findAgentById.mockResolvedValueOnce(fromAgent);
      mockDb.findAgentById.mockResolvedValueOnce(toAgent);
      mockWalletService.transfer.mockResolvedValue({ transferId: 'tx_123' });

      const result = await a2aService.executeTransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100
      });

      expect(mockDb.findAgentById).toHaveBeenCalledWith('agent1');
      expect(mockDb.findAgentById).toHaveBeenCalledWith('agent2');
      expect(mockWalletService.transfer).toHaveBeenCalledWith(expect.objectContaining({
        fromWalletId: 'wallet1',
        toWalletId: 'wallet2',
        amount: 100
      }));
      expect(result.success).toBe(true);
      expect(result.transferId).toBe('tx_123');
    });

    it('should throw error if sender agent is not found', async () => {
      mockDb.findAgentById.mockResolvedValue(null);
      await expect(a2aService.executeTransfer({
        fromAgentId: 'invalid',
        toAgentId: 'agent2',
        amount: 100
      })).rejects.toThrow('Sender agent invalid not found or inactive');
    });

    it('should throw error if amount exceeds limit', async () => {
      const fromAgent = {
        id: 'agent1',
        status: 'active',
        config: { limits: { perTransaction: 50 } }
      };
      mockDb.findAgentById.mockResolvedValueOnce(fromAgent);
      mockDb.findAgentById.mockResolvedValueOnce({ status: 'active' });

      await expect(a2aService.executeTransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100
      })).rejects.toThrow('Zero Trust Validation Failed: Amount 100 exceeds agent per-transaction limit of 50');
    });
  });
});
