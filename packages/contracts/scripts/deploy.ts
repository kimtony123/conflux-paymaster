import { ethers } from "hardhat";

const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network chainId:", chainId);

  console.log("\n1. Deploying SimpleAccountFactory...");
  const SimpleAccountFactory = await ethers.getContractFactory("SimpleAccountFactory");
  const factory = await SimpleAccountFactory.deploy(ENTRY_POINT_ADDRESS);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("SimpleAccountFactory deployed to:", factoryAddress);

  console.log("\n2. Deploying VerifyingPaymaster...");
  const VerifyingPaymaster = await ethers.getContractFactory("VerifyingPaymaster");
  
  const verifier = deployer.address;
  const minStake = ethers.parseEther("0.01");
  const unstakeDelay = 86400;
  
  const paymaster = await VerifyingPaymaster.deploy(
    ENTRY_POINT_ADDRESS,
    verifier,
    minStake,
    unstakeDelay
  );
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("VerifyingPaymaster deployed to:", paymasterAddress);

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
  console.log("Network:          ", chainId === 71n ? "Conflux eSpace Testnet" : chainId === 1030n ? "Conflux eSpace Mainnet" : "Local/Unknown");
  console.log("EntryPoint:       ", ENTRY_POINT_ADDRESS);
  console.log("Factory:          ", factoryAddress);
  console.log("Paymaster:        ", paymasterAddress);
  console.log("Test Account:     ", actualAddress);
  console.log("==========================================\n");

  console.log("NEXT STEPS:");
  console.log("1. Fund the VerifyingPaymaster contract with CFX for gas sponsorship");
  console.log("2. Update your SDK config with:");
  console.log("   - paymasterAddress:", paymasterAddress);
  console.log("   - factoryAddress:", factoryAddress);
  console.log("3. Deploy your backend signing service with the verifier private key");

  if (chainId === 71n || chainId === 1030n) {
    console.log("\n4. Verify contracts on ConfluxScan:");
    console.log(`   npx hardhat verify --network conflux${chainId === 71n ? 'Testnet' : 'Mainnet'} ${factoryAddress} ${ENTRY_POINT_ADDRESS}`);
    console.log(`   npx hardhat verify --network conflux${chainId === 71n ? 'Testnet' : 'Mainnet'} ${paymasterAddress} ${ENTRY_POINT_ADDRESS} ${verifier} ${minStake} ${unstakeDelay}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
