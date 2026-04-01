# Machine Payment Protocol (MPP)

The **Machine Payment Protocol (MPP)** is the native OCP standard for autonomous tool-call and data-packet payments. It enables machines to handle **Payment Required (HTTP 402)** flows autonomously and without manual intervention.

## 402 Flow: Autonomous Retries

The MPP middleware enables OCP agents to detect when a request requires a payment:
1. **Initial Request**: The agent makes an API call or requests data.
2. **402 Required**: The service responds with a `402 Payment Required` status, including headers for `X-MPP-Amount` and `X-MPP-Merchant-DID`.
3. **Mandate Validation**: The agent's middleware checks its available Intent Mandates for budget and authorized merchants.
4. **Autonomous Cart Mandate**: The agent generates and signs a new Cart Mandate for the exact amount.
5. **Retry**: The agent retries the request with the `X-OCP-Cart-Mandate` header.

## x402 Extension: Stablecoin Settlements

MPP supports the **x402 Extension** for 24/7, low-latency settlements using stablecoins like **USDC** and **PYUSD**.
- **Instant Finality**: Machines can settle micro-payments and tool-calls in real-time.
- **Programmable Settlement**: Rules-based settlement logic within the Web3Service.
- **Micro-transaction Optimization**: Zero-fee internal ledger transfers before settlement.

## Getting Started with MPP

Implement the MPP handler in your OCP project to enable autonomous 402 responses:

```javascript
const { MPP402Handler } = require('@open-commerce-protocol/core');

const mpp = new MPP402Handler(agentService, mandateService);

// Execute an autonomous request that handles 402 retries
const result = await mpp.executeAutonomousRequest(agent, async (config) => {
  return await axios.post('https://api.agent-services.com/data', { data: '...' }, config);
}, intentMandate);
```
