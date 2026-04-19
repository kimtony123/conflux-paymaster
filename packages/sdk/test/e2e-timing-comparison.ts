import { ethers, Network } from "ethers";
import * as dotenv from "dotenv";
import { ConfluxPaymaster } from "@conflux-paymaster/sdk";

dotenv.config({ path: "../../../.env" });

const TEST_CONFIG = {
  rpcUrl: "https://evmtestnet.confluxrpc.com",
  chainId: 71,
  paymasterAddress: "0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B",
  factoryAddress: "0x3d536eA50c323fFA2bc6b7DF0c1AE253f6144eAE",
  signingServiceUrl: process.env.BACKEND_URL || "http://localhost:3001",
  relayerServiceUrl: process.env.BACKEND_URL || "http://localhost:3001",
  bundlerUrl: "https://api.stackup.sh/v1/bundler/public",
  entryPointAddress: "0xcd3072F98c8f1Caef717dcA1f3A85d9Dc555ae8C",
  usdtTokenAddress: "0x4d1beB67e8f0102d5c983c26FDf0b7C6FFF37a0c",
  senderPrivateKey: "0x6d4a65ea03553051edaf8a3f5b193097bcdd3aada834c0a90316f95255f5f144",
  recipientAddress: "0xa7AE94401819F83DD7C3D9AA012e6dAb2c2e2D77",
  amountToTransfer: ethers.parseUnits("0.000001", 6),
  useRelayer: true,
  apiKey: process.env.API_KEY || "cfpm_sk_821c3f6115974a0baef8a577b9e2ea30",
};

const USDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

interface TimingResults {
  stepName: string;
  duration: number;
  startTime: number;
  endTime: number;
}

function createTimer(): { record: (name: string) => () => void; results: TimingResults[] } {
  const results: TimingResults[] = [];
  const startTime = Date.now();
  
  const record = (name: string) => {
    const now = Date.now();
    return () => {
      const endTime = Date.now();
      results.push({
        stepName: name,
        duration: endTime - startTime,
        startTime: startTime,
        endTime: endTime
      });
    };
  };
  
  return { record, results };
}

async function main() {
  console.log("=".repeat(70));
  console.log("E2E Timing Test: Compare Gasless vs Regular Transaction");
  console.log("=".repeat(70));

  const network = new Network("conflux-testnet", 71);
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.rpcUrl, network, { staticNetwork: network });
  const senderWallet = new ethers.Wallet(TEST_CONFIG.senderPrivateKey, provider);

  // Get initial balances
  const senderUsdtBalance = await getUsdtBalance(senderWallet.address, provider);
  const senderCfxBalance = await provider.getBalance(senderWallet.address);

  console.log("\n📊 Initial State:");
  console.log(`   Sender: ${senderWallet.address}`);
  console.log(`   USDT: ${ethers.formatUnits(senderUsdtBalance, 6)} USDT`);
  console.log(`   CFX: ${ethers.formatEther(senderCfxBalance)} CFX`);

  // Get smart account address
  const factory = new ethers.Contract(
    TEST_CONFIG.factoryAddress,
    ["function getAddress(address owner, uint256 salt) view returns (address)"],
    provider
  );
  const iface = new ethers.Interface(["function getAddress(address owner, uint256 salt) view returns (address)"]);
  const calldata = iface.encodeFunctionData("getAddress", [senderWallet.address, 0n]);
  const result = await provider.call({ to: TEST_CONFIG.factoryAddress, data: calldata });
  const smartAccountAddress = iface.decodeFunctionResult("getAddress", result)[0] as string;
  console.log(`   Smart Account: ${smartAccountAddress}`);

  // ============== GASLESS TRANSACTION (With Paymaster) ==============
  console.log("\n" + "=".repeat(70));
  console.log("TEST A: GASLESS TRANSACTION - SUBMIT TIME ONLY (No Confirmation)");
  console.log("=".repeat(70));

  const gaslessTimers: { name: string; start: number; end: number; duration: number }[] = [];
  
  // Step 1: Build UserOperation
  const gaslessStart = Date.now();
  console.log("\n[Step 1] Build UserOperation...");
  const buildStart = Date.now();
  
  const entryPointIface = new ethers.Interface(["function getNonce(address sender, uint192 key) view returns (uint256)"]);
  const entryPointCalldata = entryPointIface.encodeFunctionData("getNonce", [smartAccountAddress, 0n]);
  const entryPointResult = await provider.call({ to: TEST_CONFIG.entryPointAddress, data: entryPointCalldata });
  const nonce = entryPointIface.decodeFunctionResult("getNonce", entryPointResult)[0] as bigint;

  const usdtInterface = new ethers.Interface(USDT_ABI);
  const transferData = usdtInterface.encodeFunctionData("transfer", [TEST_CONFIG.recipientAddress, TEST_CONFIG.amountToTransfer]);
  const callData = encodeExecuteCall(smartAccountAddress, TEST_CONFIG.usdtTokenAddress, transferData);
  const feeData = await provider.getFeeData();

  const userOp = {
    sender: smartAccountAddress,
    nonce: nonce,
    initCode: "0x",
    callData: callData,
    callGasLimit: 300000n,
    verificationGasLimit: 200000n,
    preVerificationGas: 50000n,
    maxFeePerGas: feeData.maxFeePerGas || 1000000000n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1000000000n,
    paymasterAndData: "0x",
    signature: "0x",
  };
  const buildEnd = Date.now();
  gaslessTimers.push({ name: "Build UserOp", start: buildStart, end: buildEnd, duration: buildEnd - buildStart });
  console.log(`   ✅ Built in ${buildEnd - buildStart}ms`);

  // Step 2: Get Paymaster Signature
  console.log("\n[Step 2] Get Paymaster Signature (API Key + Signing)...");
  const pmSigStart = Date.now();
  const paymasterSig = await fetchPaymasterSignature(userOp, TEST_CONFIG.signingServiceUrl, TEST_CONFIG.apiKey);
  userOp.paymasterAndData = paymasterSig;
  const pmSigEnd = Date.now();
  gaslessTimers.push({ name: "Paymaster Sign", start: pmSigStart, end: pmSigEnd, duration: pmSigEnd - pmSigStart });
  console.log(`   ✅ Signed in ${pmSigEnd - pmSigStart}ms`);

  // Step 3: Sign UserOperation
  console.log("\n[Step 3] Sign UserOperation (User wallet)...");
  const signStart = Date.now();
  const userOpHashVal = getUserOpHash(userOp, TEST_CONFIG.entryPointAddress, TEST_CONFIG.chainId);
  const userSignature = await senderWallet.signMessage(ethers.getBytes(userOpHashVal));
  userOp.signature = userSignature;
  const signEnd = Date.now();
  gaslessTimers.push({ name: "User Sign", start: signStart, end: signEnd, duration: signEnd - signStart });
  console.log(`   ✅ Signed in ${signEnd - signStart}ms`);

  // Step 4: Send via Relayer (submit only, no confirmation wait)
  console.log("\n[Step 4] Send to Relayer (Submit only - no confirmation)...");
  const relayStart = Date.now();
  
  const userOpForRelay = {
    userOperation: {
      sender: userOp.sender,
      nonce: userOp.nonce.toString(),
      initCode: userOp.initCode,
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit.toString(),
      verificationGasLimit: userOp.verificationGasLimit.toString(),
      preVerificationGas: userOp.preVerificationGas.toString(),
      maxFeePerGas: userOp.maxFeePerGas.toString(),
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature,
    },
    userAddress: senderWallet.address,
  };

  const response = await fetch(`${TEST_CONFIG.relayerServiceUrl}/api/v1/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userOpForRelay),
  });

  if (!response.ok) {
    throw new Error(`Relayer failed: ${await response.text()}`);
  }

  const relayResult = await response.json() as { success: boolean; transactionHash: string; status: string };
  const relayEnd = Date.now();
  gaslessTimers.push({ name: "Relayer Submit", start: relayStart, end: relayEnd, duration: relayEnd - relayStart });
  console.log(`   ✅ Submitted in ${relayEnd - relayStart}ms`);
  console.log(`   TX: ${relayResult.transactionHash}`);

  // NO WAIT FOR CONFIRMATION - just submit time
  const gaslessSubmitOnly = Date.now() - gaslessStart;

  // ============== REGULAR TRANSACTION (User pays with own CFX) ==============
  console.log("\n" + "=".repeat(70));
  console.log("TEST B: REGULAR TRANSACTION - SUBMIT TIME ONLY (No Confirmation)");
  console.log("=".repeat(70));

  // Build regular transfer transaction
  const regularStart = Date.now();
  console.log("\n[Step 1] Build and Send Regular Transaction...");
  const regBuildStart = Date.now();

  const regularTx = await senderWallet.sendTransaction({
    to: TEST_CONFIG.recipientAddress,
    value: ethers.parseEther("0.0001"),
  });
  const regBuildEnd = Date.now();
  const regularSubmitOnly = Date.now() - regularStart;
  console.log(`   ✅ Submitted in ${regularSubmitOnly}ms`);
  console.log(`   TX: ${regularTx.hash}`);

  // NO WAIT FOR CONFIRMATION

  // ============== SUMMARY ==============
  console.log("\n" + "=".repeat(70));
  console.log("TIMING COMPARISON (SUBMIT TIME ONLY - NO CONFIRMATION)");
  console.log("=".repeat(70));

  console.log("\n📊 GASLESS TRANSACTION (via Paymaster):");
  console.log("   Submit Time:", gaslessSubmitOnly, "ms");
  console.log("\n   Breakdown:");
  gaslessTimers.forEach(t => {
    const percentage = ((t.duration / gaslessSubmitOnly) * 100).toFixed(1);
    console.log(`   - ${t.name}: ${t.duration}ms (${percentage}%)`);
  });

  console.log("\n📊 REGULAR TRANSACTION (User pays gas):");
  console.log("   Submit Time:", regularSubmitOnly, "ms");

  console.log("\n📈 COMPARISON (Submit Time Only):");
  const diff = gaslessSubmitOnly - regularSubmitOnly;
  const percentageDiff = ((diff / regularSubmitOnly) * 100).toFixed(1);
  console.log(`   Gasless is ${diff > 0 ? "SLOWER" : "FASTER"} by ${Math.abs(diff)}ms (${Math.abs(parseFloat(percentageDiff))}%)`);
  console.log(`   Overhead: ${Math.abs(diff)}ms extra for gasless submit`);

  console.log("\n🔍 BREAKDOWN:");
  const paymasterOverhead = gaslessTimers.find(t => t.name === "Paymaster Sign")?.duration || 0;
  const relayerTime = gaslessTimers.find(t => t.name === "Relayer Submit")?.duration || 0;
  const userSignTime = gaslessTimers.find(t => t.name === "User Sign")?.duration || 0;
  const buildTime = gaslessTimers.find(t => t.name === "Build UserOp")?.duration || 0;

  console.log(`   Build Time: ${buildTime}ms`);
  console.log(`   Paymaster Sign Overhead: ${paymasterOverhead}ms`);
  console.log(`   User Signing: ${userSignTime}ms`);
  console.log(`   Relayer Submit: ${relayerTime}ms`);
  console.log(`   Regular Submit: ${regularSubmitOnly}ms`);

  console.log("\n" + "=".repeat(70));
}

function encodeExecuteCall(account: string, target: string, data: string): string {
  const iface = new ethers.Interface(["function execute(address target, uint256 value, bytes data)"]);
  return iface.encodeFunctionData("execute", [target, 0n, data]);
}

function getUserOpHash(userOp: any, entryPoint: string, chainId: number): string {
  const hashInitCode = userOp.initCode && userOp.initCode !== "0x"
    ? ethers.keccak256(userOp.initCode)
    : "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hashCallData = userOp.callData && userOp.callData !== "0x"
    ? ethers.keccak256(userOp.callData)
    : "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hashPaymasterAndData = userOp.paymasterAndData && userOp.paymasterAndData !== "0x"
    ? ethers.keccak256(userOp.paymasterAndData)
    : "0x0000000000000000000000000000000000000000000000000000000000000000";
  return ethers.keccak256(ethers.solidityPacked(
    ["address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
    [userOp.sender, userOp.nonce, hashInitCode, hashCallData, userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas, userOp.maxFeePerGas, userOp.maxPriorityFeePerGas, hashPaymasterAndData]
  ));
}

async function fetchPaymasterSignature(userOp: any, signingServiceUrl: string, apiKey?: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  const response = await fetch(`${signingServiceUrl}/api/paymaster/sign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userOperation: {
        sender: userOp.sender,
        nonce: userOp.nonce.toString(),
        initCode: userOp.initCode,
        callData: userOp.callData,
        callGasLimit: userOp.callGasLimit.toString(),
        verificationGasLimit: userOp.verificationGasLimit.toString(),
        preVerificationGas: userOp.preVerificationGas.toString(),
        maxFeePerGas: userOp.maxFeePerGas.toString(),
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
        paymasterAndData: userOp.paymasterAndData,
        signature: userOp.signature,
      },
      userAddress: userOp.sender,
    }),
  });
  if (!response.ok) throw new Error(`Paymaster signing failed: ${await response.text()}`);
  return (await response.json() as { paymasterAndData: string }).paymasterAndData;
}

async function getUsdtBalance(address: string, provider: ethers.JsonRpcProvider): Promise<bigint> {
  const usdt = new ethers.Contract(TEST_CONFIG.usdtTokenAddress, USDT_ABI, provider);
  return usdt.balanceOf(address) as Promise<bigint>;
}

main().catch(console.error);