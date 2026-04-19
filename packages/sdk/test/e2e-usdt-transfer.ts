import { ethers, Network } from "ethers";
import * as dotenv from "dotenv";
import { ConfluxPaymaster } from "@conflux-paymaster/sdk";

dotenv.config({ path: "../../../.env" });

const timings: { step: string; ms: number }[] = [];
const startTime = Date.now();

function logTime(step: string) {
  const now = Date.now();
  return () => {
    const ms = Date.now() - now;
    timings.push({ step, ms });
    console.log(`   ⏱️ ${step}: ${ms}ms`);
  };
}

const TEST_CONFIG = {
  rpcUrl: "https://evmtestnet.confluxrpc.com",
  chainId: 71,
  paymasterAddress: "0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B",
  factoryAddress: "0x3d536eA50c323fFA2bc6b7DF0c1AE253f6144eAE", // FactoryV07
  // Use local backend by default
  signingServiceUrl: process.env.BACKEND_URL || "http://localhost:3001",
  relayerServiceUrl: process.env.BACKEND_URL || "http://localhost:3001",
  bundlerUrl: "https://api.stackup.sh/v1/bundler/public",
  entryPointAddress: "0xcd3072F98c8f1Caef717dcA1f3A85d9Dc555ae8C",
  usdtTokenAddress: "0x4d1beB67e8f0102d5c983c26FDf0b7C6FFF37a0c",
  senderPrivateKey: "0x6d4a65ea03553051edaf8a3f5b193097bcdd3aada834c0a90316f95255f5f144",
  recipientAddress: "0xa7AE94401819F83DD7C3D9AA012e6dAb2c2e2D77",
  amountToTransfer: ethers.parseUnits("0.000001", 6), // Transfer 0.000001 USDT to show it works
  useRelayer: true,
  // API key for dApp tracking (get from dashboard after login)
  apiKey: process.env.API_KEY || "cfpm_sk_821c3f6115974a0baef8a577b9e2ea30",
};

const USDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

async function main() {
  console.log("=".repeat(60));
  console.log("E2E Test: Paymaster Gasless USDT Transfer");
  console.log("=".repeat(60));

  const network = new Network("conflux-testnet", 71);
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.rpcUrl, network, { staticNetwork: network });
  const senderWallet = new ethers.Wallet(TEST_CONFIG.senderPrivateKey, provider);

  console.log("\n[1] Sender Wallet");
  console.log("   Address:", senderWallet.address);
  const senderUsdtBalance = await getUsdtBalance(senderWallet.address, provider);
  console.log("   USDT Balance:", ethers.formatUnits(senderUsdtBalance, 6), "USDT");
  const senderCfxBalance = await provider.getBalance(senderWallet.address);
  console.log("   CFX Balance:", ethers.formatEther(senderCfxBalance), "CFX (should be 0)");

  console.log("\n[2] Get Smart Account Address");
  const factory = new ethers.Contract(
    TEST_CONFIG.factoryAddress,
    ["function getAddress(address owner, uint256 salt) view returns (address)"],
    provider
  );

  const iface = new ethers.Interface(["function getAddress(address owner, uint256 salt) view returns (address)"]);
  const calldata = iface.encodeFunctionData("getAddress", [senderWallet.address, 0n]);
  const result = await provider.call({
    to: TEST_CONFIG.factoryAddress,
    data: calldata,
  });
  const smartAccountAddress = iface.decodeFunctionResult("getAddress", result)[0] as string;
  console.log("   Smart Account:", smartAccountAddress);

  const smartAccountCode = await provider.getCode(smartAccountAddress);
  if (smartAccountCode === "0x") {
    console.log("   ⚠️ Smart account NOT deployed yet!");
    console.log("   💡 Funding it for deployment...");
    
    console.log("\n   Funding smart account with 0.1 CFX...");
    const fundTx = await senderWallet.sendTransaction({
      to: smartAccountAddress,
      value: ethers.parseEther("0.1"),
    });
    await fundTx.wait();
    console.log("   ✅ Funded! TX:", fundTx.hash);
    
    console.log("\n   Creating account via factory...");
    const factoryIface = new ethers.Interface(["function createAccount(address owner, uint256 salt)"]);
    const createCalldata = factoryIface.encodeFunctionData("createAccount", [senderWallet.address, 0n]);
    const createTx = await senderWallet.sendTransaction({
      to: TEST_CONFIG.factoryAddress,
      data: createCalldata,
    });
    await createTx.wait();
    console.log("   ✅ Account created! TX:", createTx.hash);
  } else {
    console.log("   ✅ Smart account already deployed");
  }

console.log("\n[3] Build UserOperation");
  const timer3 = logTime("Build UserOp");
  const entryPointIface = new ethers.Interface(["function getNonce(address sender, uint192 key) view returns (uint256)"]);
  const entryPointCalldata = entryPointIface.encodeFunctionData("getNonce", [smartAccountAddress, 0n]);
  const entryPointResult = await provider.call({
    to: TEST_CONFIG.entryPointAddress,
    data: entryPointCalldata,
  });
  const nonce = entryPointIface.decodeFunctionResult("getNonce", entryPointResult)[0] as bigint;

  const usdtInterface = new ethers.Interface(USDT_ABI);
  const transferData = usdtInterface.encodeFunctionData("transfer", [
    TEST_CONFIG.recipientAddress,
    TEST_CONFIG.amountToTransfer,
  ]);

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
  timer3();
  console.log("   UserOp created:", userOp.sender);

  console.log("\n[4] Get Paymaster Signature");
  const timer4 = logTime("Paymaster Sign");
  const paymasterSig = await fetchPaymasterSignature(userOp, TEST_CONFIG.signingServiceUrl, TEST_CONFIG.apiKey);
  userOp.paymasterAndData = paymasterSig;
  timer4();
  console.log("   ✅ Paymaster signature received");

  console.log("\n[5] Sign UserOperation");
  const timer5 = logTime("User Sign");
  const userOpHashVal = getUserOpHash(userOp, TEST_CONFIG.entryPointAddress, TEST_CONFIG.chainId);
  const userSignature = await senderWallet.signMessage(ethers.getBytes(userOpHashVal));
  userOp.signature = userSignature;
  timer5();
  console.log("   ✅ UserOperation signed");

  console.log("\n[6] Send UserOperation to Relayer");
  console.log("   Relayer:", TEST_CONFIG.relayerServiceUrl);
  const timer6 = logTime("Relayer Submit");
  const timer6Confirm = logTime("Confirm TX");

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

  try {
    let txHash: string;
    let blockNumber: bigint | undefined;
    let gasUsed: bigint | undefined;

    if (TEST_CONFIG.useRelayer) {
      // Use our relayer service
      console.log("   Using our relayer service...");
      const relayStart = Date.now();
      const response = await fetch(`${TEST_CONFIG.relayerServiceUrl}/api/v1/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userOpForRelay),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Relayer failed: ${error}`);
      }

      const result = await response.json() as {
        success: boolean;
        transactionHash: string;
        status: string;
      };
      timer6();
      txHash = result.transactionHash;
      console.log("   ✅ Relayed via service! TX:", txHash);
      console.log("   ✅ Transaction submitted (not waiting for confirmation)");
    } else {
      // Direct send (old way - sender pays gas)
      const EntryPointIface = new ethers.Interface([
        "function handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)",
      ]);

      const userOpPacked = [
        userOp.sender,
        userOp.nonce,
        userOp.initCode,
        userOp.callData,
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        userOp.paymasterAndData,
        userOp.signature,
      ];

      const tx = await senderWallet.sendTransaction({
        to: TEST_CONFIG.entryPointAddress,
        data: EntryPointIface.encodeFunctionData("handleOps", [
          [userOpPacked],
          senderWallet.address,
        ]),
        gasLimit: 500000,
      });
      txHash = tx.hash;
      console.log("   ✅ Transaction sent! TX:", tx.hash);

      const receipt = await tx.wait();
      blockNumber = receipt?.blockNumber ? BigInt(receipt.blockNumber) : 0n;
      gasUsed = receipt?.gasUsed ? BigInt(receipt.gasUsed) : 0n;
    }

    console.log("   ✅ Confirmed!");
    console.log("   Block:", blockNumber);
    console.log("   Gas used:", gasUsed);

    console.log("\n[7] Verify on ConfluxScan");
    console.log("   🔍 https://evmtestnet.confluxscan.io/tx/" + txHash);

    const total = Date.now() - startTime;
    console.log("\n" + "=".repeat(60));
    console.log("TIMING SUMMARY");
    console.log("=".repeat(60));
    timings.forEach(t => {
      const pct = ((t.ms / total) * 100).toFixed(1);
      console.log(`   ${t.step}: ${t.ms}ms (${pct}%)`);
    });
    console.log(`   TOTAL: ${total}ms`);
    console.log("=".repeat(60));
    console.log("E2E Test Complete!");
    console.log("=".repeat(60));
  } catch (err: any) {
    console.error("   ❌ Transaction failed:", err.message || err);
    process.exit(1);
  }
}

function encodeExecuteCall(account: string, target: string, data: string): string {
  const iface = new ethers.Interface([
    "function execute(address target, uint256 value, bytes data)",
  ]);
  return iface.encodeFunctionData("execute", [target, 0n, data]);
}

function getUserOpHash(userOp: any, entryPoint: string, chainId: number): string {
  // EntryPoint v0.7 uses simple non-packed format (no EIP-712)
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
    [
      userOp.sender,
      userOp.nonce,
      hashInitCode,
      hashCallData,
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      hashPaymasterAndData
    ]
  ));
}

function keccak256(data: any[]): string {
  return ethers.keccak256(ethers.solidityPacked(
    ["address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
    data
  ));
}

async function fetchPaymasterSignature(userOp: any, signingServiceUrl: string, apiKey?: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Paymaster signing failed: ${error}`);
  }

  const data = (await response.json()) as { paymasterAndData: string };
  return data.paymasterAndData;
}

async function getUserOperationReceipt(userOpHash: string, bundlerUrl: string): Promise<any> {
  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getUserOperationReceipt",
      params: [userOpHash],
    }),
  });

  const data = (await response.json()) as { result?: any };
  return data.result || null;
}

async function getUsdtBalance(address: string, provider: ethers.JsonRpcProvider): Promise<bigint> {
  const usdt = new ethers.Contract(TEST_CONFIG.usdtTokenAddress, USDT_ABI, provider);
  return usdt.balanceOf(address) as Promise<bigint>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);