/**
 * ScopedVault Deployment Script
 * 
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network mainnet
 * 
 * Required env vars:
 *   PRIVATE_KEY: deployer private key
 *   RPC_URL: Ethereum RPC endpoint
 *   AGENT_ADDRESS: the AI agent's wallet address
 *
 * Contract will be deployed with:
 *   - maxPerTrade: 1,000 USDC ($1,000 per position)
 *   - maxTotalExposure: 5,000 USDC ($5,000 total)
 *   - timeWindow: 86400 (1 day)
 */

import { ethers } from "hardhat";

const USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ScopedVault with account:", deployer.address);

  const agentAddress = process.env.AGENT_ADDRESS;
  if (!agentAddress) {
    throw new Error("AGENT_ADDRESS env var required");
  }

  const maxPerTrade = ethers.parseUnits("1000", 6);      // $1,000 USDC
  const maxTotalExposure = ethers.parseUnits("5000", 6); // $5,000 USDC
  const timeWindow = 86400;                               // 1 day

  console.log(`\nDeployment parameters:`);
  console.log(`  USDC:             ${USDC_MAINNET}`);
  console.log(`  Agent:            ${agentAddress}`);
  console.log(`  Max per trade:    $${ethers.formatUnits(maxPerTrade, 6)}`);
  console.log(`  Max exposure:     $${ethers.formatUnits(maxTotalExposure, 6)}`);
  console.log(`  Time window:      ${timeWindow / 3600}h`);

  const ScopedVault = await ethers.getContractFactory("ScopedVault");
  const vault = await ScopedVault.deploy(
    USDC_MAINNET,
    agentAddress,
    maxPerTrade,
    maxTotalExposure,
    timeWindow
  );

  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log(`\n✅ ScopedVault deployed to: ${address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fund the vault: vault.deposit(amount) from owner wallet`);
  console.log(`  2. Update .env: VAULT_ADDRESS=${address}`);
  console.log(`  3. Start agent: npm run agent`);
  console.log(`\nEtherscan: https://etherscan.io/address/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
