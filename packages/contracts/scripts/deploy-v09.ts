import { ethers } from "hardhat";

async function main() {
  console.log("Deploying SimpleAccountFactoryV09 to Conflux testnet...");
  
  const [deployer] = await ethers.getSigners();
  
  const entryPointAddress = "0x6C6C2EB986bDd0080711d6854C424e6b79955390";
  
  const Factory = await ethers.getContractFactory("SimpleAccountFactoryV09");
  const factory = await Factory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("FactoryV09 deployed to:", factoryAddress);
  
  console.log("\nCreating test account...");
  const testOwner = deployer.address;
  const tx = await factory.createAccount(testOwner, 0);
  await tx.wait();
  
  const accountAddress = await factory.getAccount(testOwner);
  console.log("Account deployed to:", accountAddress);
  
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("EntryPoint:   ", entryPointAddress);
  console.log("FactoryV09:  ", factoryAddress);
  console.log("Account:     ", accountAddress);
  console.log("========================");
}

main().catch(console.error);