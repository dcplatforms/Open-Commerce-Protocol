#!/usr/bin/env node

/**
 * OCP CLI - Open Commerce Protocol Command Line Interface
 *
 * Scaffolds OCP projects, manages agent identities, issues mandates, and checks balances.
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MandateService = require('../src/services/mandate');

const program = new Command();

program
  .name('ocp')
  .description('CLI for Open Commerce Protocol (OCP) SDK')
  .version('1.0.0');

// ocp init
program.command('init')
  .description('Scaffolds a new OCP project with local vault simulation')
  .action(() => {
    console.log('Scaffolding new OCP project...');
    const projectStructure = [
      'src',
      'src/agents',
      'src/mandates',
      'config'
    ];

    projectStructure.forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    });

    const envContent = `
TOKENIZATION_API_KEY=test-key
TOKENIZATION_BASE_URL=http://localhost:8080
MANDATE_SIGNING_KEY=${crypto.randomBytes(32).toString('hex')}
STRICT_MANDATE_MODE=true
    `.trim();

    fs.writeFileSync('.env', envContent);
    console.log('Project initialized successfully. Local vault simulation configured in .env');
  });

// ocp agent:create
program.command('agent:create')
  .description('Generates an agent identity (did:key) and linked wallet')
  .argument('<name>', 'Name of the agent')
  .action((name) => {
    const agentId = `agent_${crypto.randomBytes(4).toString('hex')}`;
    const agentDid = `did:key:${crypto.randomBytes(16).toString('hex')}`;

    const agentData = {
      id: agentId,
      name: name,
      did: agentDid,
      wallet_address: `0x${crypto.randomBytes(20).toString('hex')}`,
      created_at: new Date().toISOString()
    };

    if (!fs.existsSync('src/agents')) fs.mkdirSync('src/agents', { recursive: true });
    fs.writeFileSync(`src/agents/${agentId}.json`, JSON.stringify(agentData, null, 2));

    console.log(`Agent created: ${name}`);
    console.log(`ID: ${agentId}`);
    console.log(`DID: ${agentDid}`);
  });

// ocp mandate:issue
program.command('mandate:issue')
  .description('Interactively creates a signed Intent Mandate for an agent')
  .option('--agent <id>', 'Agent ID')
  .option('--budget <amount>', 'Maximum budget', '100')
  .option('--currency <code >', 'Currency', 'USD')
  .action(async (options) => {
    if (!options.agent) {
      console.error('Error: Agent ID required. Use --agent <id>');
      return;
    }

    const signingKey = process.env.MANDATE_SIGNING_KEY || 'default-secret-key';
    const mandateService = new MandateService({ signingKey });

    const mandateToken = await mandateService.issueIntentMandate({
      userDid: 'did:key:user-local',
      agentDid: `did:key:${options.agent}`,
      maxBudget: parseFloat(options.budget),
      currency: options.currency,
      purposeCode: 'CLI_ISSUED'
    });

    const decoded = await mandateService.verifyMandate(mandateToken);
    const mandateId = decoded.mandate_id;

    if (!fs.existsSync('src/mandates')) fs.mkdirSync('src/mandates', { recursive: true });
    fs.writeFileSync(`src/mandates/${mandateId}.jwt`, mandateToken);

    console.log(`Intent Mandate issued for agent ${options.agent}`);
    console.log(`Mandate ID: ${mandateId}`);
    console.log(`Budget: ${options.budget} ${options.currency}`);
    console.log(`Saved to: src/mandates/${mandateId}.jwt`);
  });

// ocp wallet:balance
program.command('wallet:balance')
  .description('Checks real-time balances across ledger and Web3 rails')
  .argument('<address>', 'Wallet address or Agent ID')
  .action((address) => {
    console.log(`Checking balances for ${address}...`);
    // Mock balance retrieval
    const balances = {
      ledger: '500.00 USD',
      web3: {
        eth: '1.25 ETH',
        usdc: '250.00 USDC',
        pyusd: '100.00 PYUSD'
      }
    };

    console.log(`Ledger Balance: ${balances.ledger}`);
    console.log(`Web3 Balances:`);
    console.log(`  - ETH: ${balances.web3.eth}`);
    console.log(`  - USDC: ${balances.web3.usdc}`);
    console.log(`  - PYUSD: ${balances.web3.pyusd}`);
  });

// ocp x402:settle
program.command('x402:settle')
  .description('Executes a 24/7 stablecoin settlement (USDC/PYUSD) using the x402 extension')
  .argument('<amount>', 'Amount to settle')
  .option('--to <address>', 'Recipient address')
  .option('--token <type>', 'Stablecoin token (USDC/PYUSD)', 'USDC')
  .option('--mandate <path>', 'Path to the signed Mandate JWT')
  .action(async (amount, options) => {
    if (!options.to) {
      console.error('Error: Recipient address required. Use --to <address>');
      return;
    }

    console.log(`x402: Initiating ${options.token} settlement of ${amount} to ${options.to}...`);

    let mandateToken = null;
    if (options.mandate) {
      if (fs.existsSync(options.mandate)) {
        mandateToken = fs.readFileSync(options.mandate, 'utf8');
      } else {
        console.error(`Error: Mandate file not found at ${options.mandate}. In STRICT_MANDATE_MODE, a valid mandate is required for signing.`);
        return;
      }
    } else {
      console.error(`Error: Mandate required for x402 settlement in STRICT_MANDATE_MODE.`);
      return;
    }

    // Simulation of x402 settlement with fiduciary validation
    const signingKey = process.env.MANDATE_SIGNING_KEY || 'default-secret-key';
    const mandateService = new MandateService({ signingKey });

    try {
      const decodedMandate = await mandateService.verifyMandate(mandateToken);
      const amountNum = parseFloat(amount);

      // Validate budget
      if (decodedMandate.max_budget && amountNum > decodedMandate.max_budget.value) {
        console.error(`Zero Trust Validation Failed: Amount ${amountNum} exceeds mandate budget of ${decodedMandate.max_budget.value} ${decodedMandate.max_budget.currency}`);
        return;
      }

      // Validate expiration
      if (decodedMandate.exp < Math.floor(Date.now() / 1000)) {
        console.error('Zero Trust Validation Failed: Mandate has expired');
        return;
      }
    } catch (error) {
      console.error(`Zero Trust Validation Failed: ${error.message}`);
      return;
    }

    const settlementId = `x402_${crypto.randomBytes(8).toString('hex')}`;
    const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;

    console.log(`Settlement Successful!`);
    console.log(`ID: ${settlementId}`);
    console.log(`Token: ${options.token}`);
    console.log(`Amount: ${amount}`);
    console.log(`Recipient: ${options.to}`);
    console.log(`Transaction Hash: ${txHash}`);
    console.log(`Status: Finalized (24/7 Low-Latency Rails)`);
  });

program.parse();
