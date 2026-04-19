import { ethers } from "hardhat";

async function main() {
  console.log("Deploying EntryPoint to Conflux testnet...");
  
  const EntryPoint = await ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  
  const address = await entryPoint.getAddress();
  console.log("EntryPoint deployed to:", address);
}

main().catch(console.error);