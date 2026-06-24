const AgentService = require('../../src/services/agent');

describe('AgentService', () => {
  let agentService;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      createAgent: jest.fn(),
      findAgentById: jest.fn(),
      findAllAgents: jest.fn(),
      updateAgent: jest.fn(),
    };
    agentService = new AgentService(mockDb);
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
    it('should throw if amount exceeds perTransaction limit', async () => {
      mockDb.findAgentById.mockResolvedValue({
        id: 'agent1',
        config: { limits: { perTransaction: 50 } },
        status: 'active',
      });

      await expect(agentService.performA2ATransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 100
      })).rejects.toThrow(/Zero Trust Validation Failed: Transfer amount 100 exceeds per-transaction limit of 50/);
    });

    it('should throw if counterparty is not authorized', async () => {
      mockDb.findAgentById.mockImplementation((id) => {
        if (id === 'agent1') return {
          id: 'agent1',
          config: { authorizedCounterparties: ['agent3'] },
          status: 'active',
        };
        return { id: id, status: 'active' };
      });

      await expect(agentService.performA2ATransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 10
      })).rejects.toThrow(/Zero Trust Validation Failed: Agent agent2 is not an authorized counterparty/);
    });

    it('should not throw if config is missing (graceful handling)', async () => {
      mockDb.findAgentById.mockImplementation((id) => {
        return { id: id, status: 'active' }; // No config
      });

      const result = await agentService.performA2ATransfer({
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        amount: 10
      });

      expect(result.success).toBe(true);
    });
  });
});
