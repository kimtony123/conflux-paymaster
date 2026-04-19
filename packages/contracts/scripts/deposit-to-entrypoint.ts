import { ethers } from "hardhat";

const PAYMASTER_ADDRESS = "0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B";
const ENTRY_POINT_ADDRESS = "0xcd3072F98c8f1Caef717dcA1f3A85d9Dc555ae8C";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Depositing paymaster funds to EntryPoint...");
  console.log("Paymaster:", PAYMASTER_ADDRESS);
  console.log("EntryPoint:", ENTRY_POINT_ADDRESS);
  
  // Check paymaster balance before
  const pmBalanceBefore = await ethers.provider.getBalance(PAYMASTER_ADDRESS);
  console.log("Paymaster CFX before:", ethers.formatEther(pmBalanceBefore));
  
  // Get EntryPoint contract to call depositTo
  const entryPoint = await ethers.getContractAt(
    ["function depositTo(address account) external payable"],
    ENTRY_POINT_ADDRESS
  );
  
  // Deposit 10 CFX for the paymaster (from deployer wallet)
  const depositAmount = ethers.parseEther("10");
  const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: depositAmount });
  await tx.wait();
  
  console.log("Deposited 10 CFX to EntryPoint for paymaster!");
  console.log("TX:", tx.hash);
  
  // Check EntryPoint deposit for paymaster via mapping
  const depositMapping = await ethers.getContractAt(
    ["function deposit(address) view returns (uint256)"],
    ENTRY_POINT_ADDRESS
  );
  const deposit = await depositMapping.deposit(PAYMASTER_ADDRESS);
  console.log("EntryPoint deposit for paymaster:", ethers.formatEther(deposit), "CFX");
}

main().catch(console.error);