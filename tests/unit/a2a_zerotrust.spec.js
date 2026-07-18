const MandateService = require('../../src/services/mandate');
const A2AService = require('../../src/services/a2aService');

describe('A2AService Zero Trust Validation', () => {
  let a2aService;
  let mandateService;
  let mockWalletService;
  let mockDb;

  beforeEach(() => {
    mockWalletService = {
      transfer: jest.fn().mockResolvedValue({ transferId: 'tx_123' })
    };
    mockDb = {
      findAgentById: jest.fn().mockImplementation((id) => ({
        id,
        name: `Agent ${id}`,
        status: 'active',
        walletId: `wallet_${id}`,
        config: { limits: { perTransaction: 1000 } }
      }))
    };
    mandateService = new MandateService({ signingKey: 'test-secret' });
    a2aService = new A2AService(mockWalletService, mockDb, {
      mandateConfig: { signingKey: 'test-secret' },
      strictMandateMode: true
    });
  });

  it('should fail if mandate is missing in strict mode', async () => {
    await expect(a2aService.executeTransfer({
      fromAgentId: 'agent1',
      toAgentId: 'agent2',
      amount: 100
    })).rejects.toThrow('Zero Trust Validation Failed: Mandate required for A2A transfer in strict mode');
  });

  it('should fail if mandate budget is exceeded', async () => {
    const mandate = await mandateService.issueIntentMandate({
      userDid: 'did:user:1',
      agentDid: 'did:agent:1',
      maxBudget: 50
    });

    await expect(a2aService.executeTransfer({
      fromAgentId: 'agent1',
      toAgentId: 'agent2',
      amount: 100,
      mandate
    })).rejects.toThrow('Zero Trust Validation Failed: Amount 100 exceeds mandate budget of 50');
  });

  it('should fail if recipient is not authorized by mandate', async () => {
    const mandate = await mandateService.issueIntentMandate({
      userDid: 'did:user:1',
      agentDid: 'did:agent:1',
      maxBudget: 200,
      allowedMerchants: ['agent2']
    });

    await expect(a2aService.executeTransfer({
      fromAgentId: 'agent1',
      toAgentId: 'agent3',
      amount: 100,
      mandate
    })).rejects.toThrow('Zero Trust Validation Failed: Merchant agent3 not authorized by mandate');
  });

  it('should succeed with valid mandate', async () => {
    const mandate = await mandateService.issueIntentMandate({
      userDid: 'did:user:1',
      agentDid: 'did:agent:1',
      maxBudget: 200,
      allowedMerchants: ['agent2']
    });

    const result = await a2aService.executeTransfer({
      fromAgentId: 'agent1',
      toAgentId: 'agent2',
      amount: 100,
      mandate
    });

    expect(result.success).toBe(true);
    expect(mockWalletService.transfer).toHaveBeenCalled();
  });
});
