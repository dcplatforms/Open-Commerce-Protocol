const MandateService = require('../../src/services/mandate');
const jwt = require('jsonwebtoken');

describe('MandateService', () => {
  let mandateService;
  const signingKey = 'test-secret';

  beforeEach(() => {
    mandateService = new MandateService({ signingKey });
  });

  describe('issueCartMandate', () => {
    it('should throw error for invalid intent mandate type', async () => {
      const invalidMandate = jwt.sign({ type: 'not_intent' }, signingKey);
      await expect(mandateService.issueCartMandate({
        intentMandate: invalidMandate,
        cartItems: [],
        totalPrice: 100,
        merchantDid: 'did:key:m'
      })).rejects.toThrow('Zero Trust Validation Failed: Invalid intent mandate type');
    });

    it('should throw error if cart total exceeds budget', async () => {
      const intentMandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:u',
        agentDid: 'did:key:a',
        maxBudget: 50
      });

      await expect(mandateService.issueCartMandate({
        intentMandate,
        cartItems: [],
        totalPrice: 100,
        merchantDid: 'did:key:m'
      })).rejects.toThrow('Zero Trust Validation Failed: Cart total exceeds intent mandate budget');
    });

    it('should throw error if merchant is not authorized', async () => {
      const intentMandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:u',
        agentDid: 'did:key:a',
        maxBudget: 500,
        allowedMerchants: ['did:key:m1']
      });

      await expect(mandateService.issueCartMandate({
        intentMandate,
        cartItems: [],
        totalPrice: 100,
        merchantDid: 'did:key:m2'
      })).rejects.toThrow('Zero Trust Validation Failed: Merchant did:key:m2 is not authorized by this mandate');
    });
  });

  describe('verifyMandate', () => {
    it('should throw error for invalid token', async () => {
      await expect(mandateService.verifyMandate('invalid-token'))
        .rejects.toThrow('Zero Trust Validation Failed: Mandate verification failed: jwt malformed');
    });
  });
});
