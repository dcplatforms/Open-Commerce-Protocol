const AgentService = require('../../src/services/agent');
const MandateService = require('../../src/services/mandate');
const jwt = require('jsonwebtoken');

describe('AgentService with Mandates', () => {
  let agentService;
  let mockDb;
  const signingKey = 'test-secret';

  beforeEach(() => {
    mockDb = {
      findAgentById: jest.fn(),
      createAgent: jest.fn(),
    };
    agentService = new AgentService(mockDb, {
      mandateConfig: { signingKey }
    });
  });

  describe('issueIntentMandate', () => {
    it('should issue a signed intent mandate for an existing agent', async () => {
      const agentId = 'agent_123';
      const agentDid = 'did:key:abc';
      mockDb.findAgentById.mockResolvedValue({
        id: agentId,
        metadata: new Map([['did', agentDid]])
      });

      const mandateToken = await agentService.issueIntentMandate({
        userDid: 'did:key:user',
        agentId,
        maxBudget: 500,
        purposeCode: 'PROCUREMENT'
      });

      expect(mandateToken).toBeDefined();
      const decoded = jwt.verify(mandateToken, signingKey);
      expect(decoded.sub).toBe(agentDid);
      expect(decoded.max_budget.value).toBe(500);
      expect(decoded.purpose_code).toBe('PROCUREMENT');
      expect(decoded.type).toBe('intent_mandate');
    });

    it('should use default did:key if no did in metadata', async () => {
        const agentId = 'agent_456';
        mockDb.findAgentById.mockResolvedValue({
          id: agentId,
          metadata: new Map()
        });

        const mandateToken = await agentService.issueIntentMandate({
          userDid: 'did:key:user',
          agentId,
          maxBudget: 100
        });

        const decoded = jwt.verify(mandateToken, signingKey);
        expect(decoded.sub).toBe(`did:key:${agentId}`);
      });
  });

  describe('issueAgentVC', () => {
    it('should issue a signed agent VC', async () => {
      const agentId = 'agent_123';
      mockDb.findAgentById.mockResolvedValue({
        id: agentId,
        metadata: new Map()
      });

      const vcToken = await agentService.issueAgentVC({
        userDid: 'did:key:user',
        agentId,
        capabilities: ['payment']
      });

      expect(vcToken).toBeDefined();
      const decoded = jwt.verify(vcToken, signingKey);
      expect(decoded.sub).toBe(`did:key:${agentId}`);
      expect(decoded.vc.type).toContain('AgentAuthorityCredential');
      expect(decoded.vc.credentialSubject.capabilities).toContain('payment');
    });
  });
});
