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
      await expect(agentService.getAgent('nonexistent')).rejects.toThrow('Zero Trust Validation Failed: Agent not found');
    });
  });
});
