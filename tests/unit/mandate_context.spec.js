const MandateService = require("../../src/services/mandate");
const jwt = require("jsonwebtoken");

describe("MandateService - Context Validation", () => {
  let mandateService;
  const signingKey = "test-secret";

  beforeEach(() => {
    mandateService = new MandateService({ signingKey });
  });

  it("should validate amount against intent mandate budget", async () => {
    const mandate = await mandateService.issueIntentMandate({
      userDid: "did:key:user",
      agentDid: "did:key:agent",
      maxBudget: 100,
    });

    // Valid amount
    await expect(
      mandateService.verifyMandate(mandate, { amount: 50 }),
    ).resolves.toBeDefined();

    // Invalid amount
    await expect(
      mandateService.verifyMandate(mandate, { amount: 150 }),
    ).rejects.toThrow(
      "Zero Trust Validation Failed: Amount 150 exceeds mandate budget of 100",
    );
  });

  it("should validate recipient against allowed_merchants whitelist", async () => {
    const mandate = await mandateService.issueIntentMandate({
      userDid: "did:key:user",
      agentDid: "did:key:agent",
      maxBudget: 100,
      allowedMerchants: ["did:key:merchant-1"],
    });

    // Authorized merchant
    await expect(
      mandateService.verifyMandate(mandate, { recipient: "did:key:merchant-1" }),
    ).resolves.toBeDefined();

    // Unauthorized merchant
    await expect(
      mandateService.verifyMandate(mandate, { recipient: "did:key:merchant-2" }),
    ).rejects.toThrow(
      "Zero Trust Validation Failed: Merchant did:key:merchant-2 not authorized by mandate",
    );
  });

  it("should handle expired tokens with correct prefix", async () => {
    const mandate = jwt.sign(
      {
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      signingKey,
    );

    await expect(mandateService.verifyMandate(mandate)).rejects.toThrow(
      "Zero Trust Validation Failed: Mandate has expired",
    );
  });
});
