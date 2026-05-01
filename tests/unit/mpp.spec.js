const MPP402Handler = require('../../src/middleware/mpp');
const MandateService = require('../../src/services/mandate');

describe('MPP402Handler', () => {
  let mppHandler;
  let mockAgentService;
  let mockMandateService;
  const signingKey = 'test-secret';

  beforeEach(() => {
    mockAgentService = {};
    mockMandateService = new MandateService({ signingKey });
    mppHandler = new MPP402Handler(mockAgentService, mockMandateService);
  });

  describe('executeAutonomousRequest', () => {
    it('should return response if status is not 402', async () => {
      const mockResponse = { status: 200, data: 'success' };
      const requestFn = jest.fn().mockResolvedValue(mockResponse);
      const agent = { name: 'TestAgent' };

      const result = await mppHandler.executeAutonomousRequest(agent, requestFn, 'some-token');

      expect(result).toBe(mockResponse);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should handle 402, issue cart mandate and retry', async () => {
      const agent = { id: 'agent_123', name: 'TestAgent' };
      const intentMandate = await mockMandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 1000
      });

      const response402 = {
        status: 402,
        headers: {
          'x-mpp-amount': '500',
          'x-mpp-currency': 'USD',
          'x-mpp-merchant-did': 'did:key:merchant'
        },
        data: {
          cart_items: [{ item: 'API', quantity: 1 }]
        }
      };

      const finalResponse = { status: 200, data: 'paid' };

      // First call returns 402, second call returns 200
      const requestFn = jest.fn()
        .mockResolvedValueOnce(response402)
        .mockResolvedValueOnce(finalResponse);

      const result = await mppHandler.executeAutonomousRequest(agent, requestFn, intentMandate);

      expect(result).toBe(finalResponse);
      expect(requestFn).toHaveBeenCalledTimes(2);

      // Verify retry call had the cart mandate header
      const secondCallArgs = requestFn.mock.calls[1][0];
      expect(secondCallArgs.headers['X-OCP-Cart-Mandate']).toBeDefined();
      expect(secondCallArgs.headers['Authorization']).toBe(`Bearer ${agent.id}`);
    });

    it('should throw error if payment amount exceeds intent budget', async () => {
        const agent = { name: 'TestAgent' };
        const intentMandate = await mockMandateService.issueIntentMandate({
          userDid: 'did:key:user',
          agentDid: 'did:key:agent',
          maxBudget: 100
        });

        const response402 = {
          status: 402,
          headers: {
            'x-mpp-amount': '500',
            'x-mpp-merchant-did': 'did:key:merchant'
          }
        };

        const requestFn = jest.fn().mockResolvedValue(response402);

        await expect(mppHandler.executeAutonomousRequest(agent, requestFn, intentMandate))
          .rejects.toThrow('MPP: Payment amount 500 exceeds intent mandate budget of 100');
    });

    it('should throw error if 402 response is missing requirements', async () => {
        const agent = { name: 'TestAgent' };
        const intentMandate = 'some-token';
        const response402 = {
          status: 402,
          headers: {} // Missing amount and merchant
        };

        const requestFn = jest.fn().mockResolvedValue(response402);

        await expect(mppHandler.executeAutonomousRequest(agent, requestFn, intentMandate))
          .rejects.toThrow('Incomplete payment requirements in 402 response');
    });

    it('should handle 402 thrown as an error (e.g. from axios)', async () => {
        const agent = { id: 'agent_123', name: 'TestAgent' };
        const intentMandate = await mockMandateService.issueIntentMandate({
          userDid: 'did:key:user',
          agentDid: 'did:key:agent',
          maxBudget: 1000
        });

        const error402 = new Error('Payment Required');
        error402.response = {
          status: 402,
          headers: {
            'x-mpp-amount': '500',
            'x-mpp-merchant-did': 'did:key:merchant'
          }
        };

        const finalResponse = { status: 200, data: 'paid' };
        const requestFn = jest.fn()
          .mockRejectedValueOnce(error402)
          .mockResolvedValueOnce(finalResponse);

        const result = await mppHandler.executeAutonomousRequest(agent, requestFn, intentMandate);

        expect(result).toBe(finalResponse);
        expect(requestFn).toHaveBeenCalledTimes(2);
    });
  });
});
