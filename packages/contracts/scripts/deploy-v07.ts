import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network chainId:", chainId);

  console.log("\n1. Deploying EntryPointV07...");
  const EntryPoint = await ethers.getContractFactory("EntryPointV07");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddress = await entryPoint.getAddress();
  console.log("EntryPointV07 deployed to:", entryPointAddress);

  console.log("\n2. Deploying SimpleAccountFactoryV07...");
  const Factory = await ethers.getContractFactory("SimpleAccountFactoryV07");
  const factory = await Factory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("SimpleAccountFactoryV07 deployed to:", factoryAddress);

  console.log("\n3. Testing account creation...");
  const testOwner = ethers.Wallet.createRandom().address;
  const salt = 0;
  
  const predictedAddress = await factory.getAddress(testOwner, salt);
  console.log("Predicted account address:", predictedAddress);
  
  const tx = await factory.createAccount(testOwner, salt);
  await tx.wait();
  
  const actualAddress = await factory.getAccount(testOwner);
  console.log("Actual account address:", actualAddress);
  console.log("Addresses match:", predictedAddress === actualAddress);

  console.log("\n========== DEPLOYMENT SUMMARY ==========");
  console.log("Network:          ", chainId === 71n ? "Conflux eSpace Testnet" : "Local/Unknown");
  console.log("EntryPointV07:    ", entryPointAddress);
  console.log("FactoryV07:        ", factoryAddress);
  console.log("Test Account:      ", actualAddress);
  console.log("==========================================\n");

  console.log("NEXT STEPS:");
  console.log("Update your SDK config with:");
  console.log("  - entryPoint:", entryPointAddress);
  console.log("  - factoryAddress:", factoryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });