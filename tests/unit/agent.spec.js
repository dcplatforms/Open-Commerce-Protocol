const AgentService = require('../../src/services/agent');

describe('AgentService', () => {
  let agentService;
  let mockDb;
  let mockA2AService;

  beforeEach(() => {
    mockDb = {
      createAgent: jest.fn(),
      findAgentById: jest.fn(),
      findAllAgents: jest.fn(),
      updateAgent: jest.fn(),
    };
    mockA2AService = {
      executeTransfer: jest.fn()
    };
    agentService = new AgentService(mockDb, {}, mockA2AService);
  });

  describe('registerAgent', () => {
    it('should register a new agent with default policies', async () => {
      const agentData = { name: 'Test Agent', ownerId: 'owner123', walletId: 'wallet123' };
      const expectedAgent = { ...agentData, id: 'agent123', status: 'active', config: { limits: { perTransaction: 1000 } } };
      mockDb.createAgent.mockResolvedValue(expectedAgent);

      const agent = await agentService.registerAgent(agentData);

      expect(mockDb.createAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Agent',
        ownerId: 'owner123',
        walletId: 'wallet123',
        status: 'active'
      }));
      expect(agent).toEqual(expectedAgent);
    });
  });

  describe('getAgent', () => {
    it('should throw if agent not found', async () => {
      mockDb.findAgentById.mockResolvedValue(null);
      await expect(agentService.getAgent('nonexistent')).rejects.toThrow('Agent not found');
    });
  });

  describe('performA2ATransfer', () => {
    it('should delegate to a2aService if provided', async () => {
      const transferParams = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        currency: 'USD'
      };
      const expectedResult = { success: true, transferId: 'tx123' };
      mockA2AService.executeTransfer.mockResolvedValue(expectedResult);

      const result = await agentService.performA2ATransfer(transferParams);

      expect(mockA2AService.executeTransfer).toHaveBeenCalledWith({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        ucpPayload: { currency: 'USD' }
      });
      expect(result).toEqual(expectedResult);
    });

    it('should fallback to local logic if a2aService is not provided', async () => {
      const localAgentService = new AgentService(mockDb);
      const fromAgent = {
        id: 'agent1',
        config: { limits: { perTransaction: 500 }, authorizedCounterparties: ['agent2'] }
      };
      const toAgent = { id: 'agent2' };

      mockDb.findAgentById.mockResolvedValueOnce(fromAgent);
      mockDb.findAgentById.mockResolvedValueOnce(toAgent);

      const result = await localAgentService.performA2ATransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        currency: 'USD'
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(100);
    });

    it('should throw error in fallback if amount exceeds limit', async () => {
      const localAgentService = new AgentService(mockDb);
      const fromAgent = {
        id: 'agent1',
        config: { limits: { perTransaction: 50 } }
      };

      mockDb.findAgentById.mockResolvedValueOnce(fromAgent);
      mockDb.findAgentById.mockResolvedValueOnce({ id: 'agent2' });

      await expect(localAgentService.performA2ATransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100,
        currency: 'USD'
      })).rejects.toThrow('Zero Trust Validation Failed: Amount 100 exceeds agent per-transaction limit of 50');
    });
  });
});
