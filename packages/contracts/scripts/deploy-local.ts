import { ethers } from "hardhat";

const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function main() {
  const [deployer, verifier, user1, user2] = await ethers.getSigners();
  
  console.log("Deploying contracts for local testing...\n");
  console.log("Accounts:");
  console.log("  Deployer:", deployer.address);
  console.log("  Verifier:", verifier.address);
  console.log("  User1:", user1.address);
  console.log("  User2:", user2.address);

  console.log("\n1. Deploying SimpleAccountFactory...");
  const SimpleAccountFactory = await ethers.getContractFactory("SimpleAccountFactory");
  const factory = await SimpleAccountFactory.deploy(ENTRY_POINT_ADDRESS);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("   SimpleAccountFactory deployed to:", factoryAddress);

  console.log("\n2. Deploying VerifyingPaymaster...");
  const VerifyingPaymaster = await ethers.getContractFactory("VerifyingPaymaster");
  const paymaster = await VerifyingPaymaster.deploy(
    ENTRY_POINT_ADDRESS,
    verifier.address,
    ethers.parseEther("0.01"),
    86400
  );
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("   VerifyingPaymaster deployed to:", paymasterAddress);

  console.log("\n3. Funding VerifyingPaymaster...");
  const fundTx = await deployer.sendTransaction({
    to: paymasterAddress,
    value: ethers.parseEther("1.0")
  });
  await fundTx.wait();
  console.log("   Funded with 1 CFX");

  console.log("\n4. Creating test accounts...");
  const salt = 0;
  
  const account1Tx = await factory.createAccount(user1.address, salt);
  await account1Tx.wait();
  const account1Address = await factory.getAccount(user1.address);
  console.log("   Account1 for User1:", account1Address);

  const account2Salt = 1;
  const account2Tx = await factory.createAccount(user2.address, account2Salt);
  await account2Tx.wait();
  const account2Address = await factory.getAccount(user2.address);
  console.log("   Account2 for User2:", account2Address);

  console.log("\n5. Testing SimpleAccount execute...");
  const SimpleAccount = await ethers.getContractFactory("SimpleAccount");
  const account1 = SimpleAccount.attach(account1Address);
  
  const testTarget = ethers.Wallet.createRandom().address;
  const testValue = ethers.parseEther("0.01");
  
  console.log("   Sending 0.01 CFX to:", testTarget);
  const balanceBefore = await ethers.provider.getBalance(testTarget);
  const executeTx = await account1.execute(testTarget, testValue, "0x");
  await executeTx.wait();
  const balanceAfter = await ethers.provider.getBalance(testTarget);
  console.log("   Balance change:", (balanceAfter - balanceBefore).toString());

  console.log("\n========== LOCAL DEPLOYMENT COMPLETE ==========");
  console.log("EntryPoint:       ", ENTRY_POINT_ADDRESS);
  console.log("Factory:          ", factoryAddress);
  console.log("Paymaster:        ", paymasterAddress);
  console.log("================================================\n");

  console.log("Configuration for SDK:");
  console.log(JSON.stringify({
    entryPointAddress: ENTRY_POINT_ADDRESS,
    factoryAddress: factoryAddress,
    paymasterAddress: paymasterAddress,
    verifierAddress: verifier.address,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
