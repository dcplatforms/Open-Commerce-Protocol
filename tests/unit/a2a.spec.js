const A2AService = require('../../src/services/a2aService');
const MandateService = require('../../src/services/mandate');

describe('A2AService', () => {
  let a2aService;
  let mockWalletService;
  let mockDb;
  let mandateService;
  let validMandate;

  beforeAll(async () => {
    mandateService = new MandateService({ signingKey: 'test-secret' });
    validMandate = await mandateService.issueIntentMandate({
      userDid: 'did:key:user',
      agentDid: 'did:key:agent1',
      maxBudget: 1000
    });
  });

  beforeEach(() => {
    mockWalletService = {
      transfer: jest.fn().mockResolvedValue({ success: true, transferId: 'tx123' })
    };
    mockDb = {
      findAgentById: jest.fn()
    };
    a2aService = new A2AService(mockWalletService, mockDb, {
      mandateConfig: { signingKey: 'test-secret' },
      strictMandateMode: true
    });
  });

  describe('executeTransfer', () => {
    it('should throw error if mandate is missing in strict mode', async () => {
      await expect(a2aService.executeTransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100
      })).rejects.toThrow('Zero Trust Validation Failed: Mandate required for A2A transfer in strict mode');
    });

    it('should throw error if mandate is invalid', async () => {
      await expect(a2aService.executeTransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        mandate: 'invalid-token'
      })).rejects.toThrow(/Zero Trust Validation Failed: Mandate verification failed/);
    });

    it('should execute transfer when mandate is valid and agents exist', async () => {
      const fromAgent = {
        id: 'agent1',
        name: 'Agent 1',
        status: 'active',
        walletId: 'wallet1',
        config: { limits: { perTransaction: 500 } }
      };
      const toAgent = {
        id: 'agent2',
        name: 'Agent 2',
        status: 'active',
        walletId: 'wallet2'
      };

      mockDb.findAgentById.mockImplementation((id) => {
        if (id === 'agent1') return fromAgent;
        if (id === 'agent2') return toAgent;
        return null;
      });

      const result = await a2aService.executeTransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        mandate: validMandate
      });

      expect(result.success).toBe(true);
      expect(mockWalletService.transfer).toHaveBeenCalled();
    });

    it('should throw error if agent is not found', async () => {
        mockDb.findAgentById.mockResolvedValue(null);

        await expect(a2aService.executeTransfer({
          fromAgentId: 'agent1',
          toAgentId: 'agent2',
          amount: 100,
          mandate: validMandate
        })).rejects.toThrow('Zero Trust Validation Failed: Sender agent agent1 not found or inactive');
      });
  });
});
