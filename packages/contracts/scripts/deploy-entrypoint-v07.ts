import { ethers } from "hardhat";

async function main() {
  console.log("Deploying EntryPointV07 to Conflux testnet...");
  
  const EntryPoint = await ethers.getContractFactory("EntryPointV07");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  
  const address = await entryPoint.getAddress();
  console.log("EntryPointV07 deployed to:", address);
}

main().catch(console.error);