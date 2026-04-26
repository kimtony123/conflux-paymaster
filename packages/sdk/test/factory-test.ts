import { ethers } from "ethers";

const RPC_URL = "https://evmtestnet.confluxrpc.com";
const USDT_TOKEN = "0x4d1beB67e8f0102d5c983c26FDf0b7C6FFF37a0c";
const FACTORY_ADDRESS = "0x011497Bb8E0DEbBD3cde2408D75D0d3504d12E7e";

const TEST_OWNERS = [
  "0xe4966b6CE320a88065c5Be2F6036a36a90d2f6b8",
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];

async function runTests() {
  console.log("============================================================");
  console.log(" COMPREHENSIVE FACTORY TEST");
  console.log("============================================================");
  console.log("");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // TEST 1: Factory Deployment
  console.log("TEST 1: Factory Deployment");
  console.log("----------------------------------------");
  const factoryCode = await provider.getCode(FACTORY_ADDRESS);
  console.log("Factory address:", FACTORY_ADDRESS);
  console.log("Factory has code:", factoryCode.length > 10 ? "PASS" : "FAIL");
  console.log("Code length:", factoryCode.length);
  console.log("");

  // TEST 2: Factory.getAddress prediction
  console.log("TEST 2: Factory getAddress() Prediction");
  console.log("----------------------------------------");
  const factory = new ethers.Contract(
    FACTORY_ADDRESS,
    ["function getAddress(address owner, uint256 salt) view returns (address)"],
    provider
  );
  
  for (const owner of TEST_OWNERS) {
    const predictedAddr = await factory.getAddress(owner, 0n);
    console.log("Owner:", owner);
    console.log("  Predicted:", predictedAddr);
    const hasCode = await provider.getCode(predictedAddr);
    console.log("  Has code:", hasCode === "0x" ? "No (not deployed)" : "Yes " + hasCode.substring(0, 10) + "...");
  }
  console.log("");

  // TEST 3: Check existing accounts
  console.log("TEST 3: Existing Account Verification");
  console.log("----------------------------------------");
  const knownAccounts = [
    "0xFcD4f693ce3F075481eC7B03a3B6BDC733226668", // deployed during factory deploy
    "0x9Bf7584Bf1F1AbdDcdc46Bd71f7ACBf5Fc6479BD", // old broken account
  ];
  
  for (const addr of knownAccounts) {
    const code = await provider.getCode(addr);
    console.log("Account:", addr);
    console.log("  Has code:", code.length > 2 ? "YES " + code.substring(0, 16) + "..." : "NO - Empty");
  }
  console.log("");

  // TEST 4: Verify deployed account has execute function
  console.log("TEST 4: Account verify Execute Function");
  console.log("----------------------------------------");
  const deployedAccount = "0xFcD4f693ce3F075481eC7B03a3B6BDC733226668";
  let accountCode = await provider.getCode(deployedAccount);
  console.log("Account:", deployedAccount);
  console.log("Has code:", accountCode.length > 2);
  
  if (accountCode.length > 2) {
    // Try to call owner()
    const account = new ethers.Contract(
      deployedAccount,
      ["function owner() view returns (address)"],
      provider
    );
    try {
      const owner = await account.owner();
      console.log("Owner read: SUCCESS - " + owner);
    } catch(e) {
      console.log("Owner read: FAIL - " + e.message.substring(0, 50));
    }
    
    // Try to call execute() selector
    try {
      const execData = "0xb61d27f6" + "00".repeat(100); // execute selector + args
      const result = await provider.call({
        to: deployedAccount,
        data: execData.substring(0, 10)
      });
      console.log("Execute callable: result=" + result.substring(0, 20));
    } catch(e) {
      console.log("Execute: " + e.message.substring(0, 60));
    }
  }
  console.log("");

  // TEST 5: Test createAccount directly (requires private key - we'll simulate the logic check)
  console.log("TEST 5: createAccount Logic Check");
  console.log("----------------------------------------");
  const testOwner = "0x" + "ab".repeat(20);
  try {
    // This will fail without proper signing, but we can check it returns proper address
    const predicted = await factory.getAddress(testOwner, 0n);
    console.log("For new owner:", testOwner);
    console.log("Predicted address:", predicted);
    console.log("Would need CREATE2 to deploy");
  } catch(e) {
    console.log("Error:", e.message);
  }
  console.log("");

  console.log("============================================================");
  console.log(" FACTORY TEST COMPLETE - SUMMARY");
  console.log("============================================================");
  console.log("Factory Address: ", FACTORY_ADDRESS);
  console.log("Deployed account from test: 0xFcD4f693ce3F075481eC7B03a3B6BDC733226668");
}

runTests().catch(console.error);