const Web3Service = require('../../src/services/web3');
const TokenizationService = require('../../src/services/tokenization');
const MandateService = require('../../src/services/mandate');

describe('Web3Service', () => {
  let web3Service;
  let tokenizationService;
  const signingKey = 'test-secret';
  const apiKey = 'test-key';

  beforeEach(() => {
    tokenizationService = new TokenizationService({
      apiKey,
      mandateConfig: { signingKey },
      strictMandateMode: true
    });
    web3Service = new Web3Service(tokenizationService);
    process.env.NODE_ENV = 'test';
  });

  describe('executeX402Settlement', () => {
    it('should successfully execute settlement with a valid mandate', async () => {
      const mandateService = new MandateService({ signingKey });
      const mandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 1000
      });

      const result = await web3Service.executeX402Settlement({
        keyTokenId: 'token_123',
        to: '0xRecipient',
        amount: 500,
        stablecoin: 'USDC',
        mandate
      });

      expect(result.status).toBe('finalized');
      expect(result.amount).toBe(500);
      expect(result.stablecoin).toBe('USDC');
    });

    it('should fail if mandate budget is exceeded', async () => {
      const mandateService = new MandateService({ signingKey });
      const mandate = await mandateService.issueIntentMandate({
        userDid: 'did:key:user',
        agentDid: 'did:key:agent',
        maxBudget: 100
      });

      await expect(web3Service.executeX402Settlement({
        keyTokenId: 'token_123',
        to: '0xRecipient',
        amount: 500,
        stablecoin: 'USDC',
        mandate
      })).rejects.toThrow('Zero Trust Validation Failed: Amount 500 exceeds mandate budget of 100');
    });

    it('should fail if no mandate is provided in strict mode', async () => {
        await expect(web3Service.executeX402Settlement({
          keyTokenId: 'token_123',
          to: '0xRecipient',
          amount: 500,
          stablecoin: 'USDC'
        })).rejects.toThrow('Zero Trust Validation Failed: Mandate required for signing in strict mode');
      });
  });

  describe('sendTransaction', () => {
    it('should successfully sign and "broadcast" transaction with valid mandate', async () => {
        const mandateService = new MandateService({ signingKey });
        const mandate = await mandateService.issueIntentMandate({
          userDid: 'did:key:user',
          agentDid: 'did:key:agent',
          maxBudget: 1000
        });

        const result = await web3Service.sendTransaction({
          keyTokenId: 'token_123',
          to: '0xRecipient',
          value: '0.1',
          mandate,
          context: { amount: 500 } // Simulation context
        });

        expect(result.status).toBe('pending');
        expect(result.signedData).toBeDefined();
      });
  });
});
