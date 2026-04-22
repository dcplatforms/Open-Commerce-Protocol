const TokenizationService = require('../../src/services/tokenization');
const MandateService = require('../../src/services/mandate');
const jwt = require('jsonwebtoken');

describe('TokenizationService', () => {
  let tokenizationService;
  const signingKey = 'test-secret';
  const apiKey = 'test-key';

  beforeEach(() => {
    tokenizationService = new TokenizationService({
      apiKey,
      mandateConfig: { signingKey },
      strictMandateMode: true
    });
    process.env.NODE_ENV = 'test';
  });

  describe('signWithToken - Zero Trust Validation', () => {
    it('should throw error if mandate is required but not provided in strict mode', async () => {
      await expect(tokenizationService.signWithToken('token_123', 'data'))
        .rejects.toThrow('Zero Trust Validation Failed: Mandate required for signing in strict mode');
    });

    it('should throw error if amount exceeds mandate budget', async () => {
      const mandateService = new MandateService({ signingKey });
      const mandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 100
      });

      await expect(tokenizationService.signWithToken('token_123', 'data', mandate, { amount: 150 }))
        .rejects.toThrow('Zero Trust Validation Failed: Amount 150 exceeds mandate budget of 100');
    });

    it('should throw error if merchant is not authorized', async () => {
      const mandateService = new MandateService({ signingKey });
      const mandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 1000,
        allowedMerchants: ['did:key:merchant_a']
      });

      await expect(tokenizationService.signWithToken('token_123', 'data', mandate, { merchant: 'did:key:merchant_b' }))
        .rejects.toThrow('Zero Trust Validation Failed: Merchant did:key:merchant_b not authorized by mandate');
    });

    it('should throw error if mandate has expired', async () => {
        const mandateService = new MandateService({ signingKey });
        const mandate = await mandateService.issueIntentMandate({
          userDid: 'did:key:user',
          agentDid: 'did:key:agent',
          maxBudget: 1000,
          expiration: Math.floor(Date.now() / 1000) - 100 // Expired 100s ago
        });

        await expect(tokenizationService.signWithToken('token_123', 'data', mandate))
          .rejects.toThrow('Zero Trust Validation Failed: Mandate has expired');
      });

    it('should successfully sign if mandate is valid', async () => {
      const mandateService = new MandateService({ signingKey });
      const mandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 1000,
        allowedMerchants: ['did:key:merchant_a']
      });

      const signature = await tokenizationService.signWithToken(
        'token_123',
        'data',
        mandate,
        { amount: 500, merchant: 'did:key:merchant_a' }
      );

      expect(signature).toContain('0x_mock_signature');
      expect(signature).toContain('validated_by_mandate');
    });
  });
});
