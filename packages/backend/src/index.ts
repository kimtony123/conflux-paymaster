import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";
import { z } from "zod";
import * as dotenv from "dotenv";
import * as db from "./db/index.js";
import authRoutes from "./routes/auth.js";
import dappRoutes from "./routes/dapps.js";
import depositRoutes from "./routes/deposits.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || "";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY || "";
const CONFLUX_RPC_URL = process.env.CONFLUX_RPC_URL || "https://evmtestnet.confluxrpc.com";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "71");
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const DAILY_TX_LIMIT = parseInt(process.env.DAILY_TX_LIMIT || "100");
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

console.log("🔧 Starting with RPC:", CONFLUX_RPC_URL, "Chain:", CHAIN_ID);

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const userOpSchema = z.object({
  sender: z.string(),
  nonce: z.string(),
  initCode: z.string(),
  callData: z.string(),
  callGasLimit: z.string(),
  verificationGasLimit: z.string(),
  preVerificationGas: z.string(),
  maxFeePerGas: z.string(),
  maxPriorityFeePerGas: z.string(),
  paymasterAndData: z.string(),
  signature: z.string(),
});

const signRequestSchema = z.object({
  userOperation: userOpSchema,
  userAddress: z.string(),
});

interface VerifierInfo {
  address: string;
  name: string;
  dailyLimit: number;
  createdAt: number;
}

const verifierRegistry = new Map<string, VerifierInfo>();

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let relayerWallet: ethers.Wallet;
let paymaster: ethers.Contract;
let entryPoint: ethers.Contract;

async function init() {
  await db.initDatabase();

  if (!PAYMASTER_ADDRESS || !SIGNER_PRIVATE_KEY) {
    console.error("Missing required environment variables:");
    console.error("  PAYMASTER_ADDRESS:", !!PAYMASTER_ADDRESS);
    console.error("  SIGNER_PRIVATE_KEY:", !!SIGNER_PRIVATE_KEY);
    process.exit(1);
  }

  provider = new ethers.JsonRpcProvider(CONFLUX_RPC_URL);
  signer = new ethers.Wallet(SIGNER_PRIVATE_KEY, provider);
  relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
  
  const paymasterABI = [
    "function getHash((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes) userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)",
    "function validatePaymasterUserOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes) userOp, bytes32 userOpHash, uint256 missingAccountFunds) returns (bytes memory context, uint256 validationData)",
  ];
  
  const entryPointABI = [
    "function handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address) returns ()",
    "function getNonce(address sender, uint192 key) view returns (uint256)",
  ];
  
  paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterABI, provider);
  entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointABI, provider);
  
  console.log("=== CONFLUX PAYMASTER SERVICES ===");
  console.log("\n[SERVICE A] Signing Service:");
  console.log("  Paymaster:", PAYMASTER_ADDRESS);
  console.log("  Signer:", signer.address);
  
  console.log("\n[SERVICE B] Relayer Service:");
  console.log("  Relayer Wallet:", relayerWallet.address);
  console.log("  EntryPoint:", ENTRY_POINT_ADDRESS);
  
  console.log("\n[Network]");
  console.log("  Chain ID:", CHAIN_ID);
  console.log("  RPC:", CONFLUX_RPC_URL);
}

function getRateLimitKey(req: Request): string {
  const userAddress = req.body?.userAddress || req.ip || "unknown";
  return `${userAddress}-${new Date().toISOString().split("T")[0]}`;
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; resetTime: number } {
  const key = getRateLimitKey(req);
  const now = Date.now();
  
  if (!rateLimitMap.has(key) || rateLimitMap.get(key)!.resetTime < now) {
    rateLimitMap.set(key, { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  
  const limit = rateLimitMap.get(key)!;
  const allowed = limit.count < DAILY_TX_LIMIT;
  
  if (allowed) {
    limit.count++;
  }
  
  return {
    allowed,
    remaining: Math.max(0, DAILY_TX_LIMIT - limit.count),
    resetTime: limit.resetTime,
  };
}

function getUserOpHash(userOp: z.infer<typeof userOpSchema>): string {
  const packed = ethers.solidityPacked(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
    ],
    [
      userOp.sender,
      BigInt(userOp.nonce),
      ethers.keccak256(userOp.initCode || "0x"),
      ethers.keccak256(userOp.callData || "0x"),
      BigInt(userOp.callGasLimit),
      BigInt(userOp.verificationGasLimit),
      BigInt(userOp.preVerificationGas),
      BigInt(userOp.maxFeePerGas),
      BigInt(userOp.maxPriorityFeePerGas),
      ethers.keccak256(userOp.paymasterAndData || "0x"),
    ]
  );
  
  return ethers.keccak256(packed);
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/paymaster/quote", async (req: Request, res: Response) => {
  try {
    const feeData = await provider.getFeeData();
    
    res.json({
      maxFeePerGas: feeData.maxFeePerGas?.toString() || "0",
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || "0",
      gasPrice: feeData.gasPrice?.toString() || "0",
    });
  } catch (error: any) {
    console.error("Quote error:", error);
    res.status(500).json({ error: "Failed to get gas quote" });
  }
});

app.post("/api/paymaster/sign", async (req: Request, res: Response) => {
  try {
    const validation = signRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request body", details: validation.error.issues });
    }

    const { userOperation, userAddress } = validation.data;
    const apiKey = req.headers["x-api-key"] as string;

    const rateLimit = checkRateLimit(req);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: "Daily rate limit exceeded",
        resetTime: new Date(rateLimit.resetTime).toISOString(),
      });
    }

    const userOpHash = getUserOpHash(userOperation);

    const validUntil = 0;
    const validAfter = 0;

    let hash: string;
    try {
      hash = await paymaster.getHash.staticCall(userOperation, validUntil, validAfter);
    } catch {
      hash = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "address", "uint256"],
          [userOpHash, PAYMASTER_ADDRESS, CHAIN_ID]
        )
      );
    }

    const signature = await signer.signMessage(ethers.getBytes(hash));

    const paymasterAndData = ethers.solidityPacked(
      ["address", "bytes"],
      [PAYMASTER_ADDRESS, signature]
    );

    if (apiKey) {
      let freeTierInfo = null;
      try {
        const dapp = await db.findDappByApiKey(apiKey);
        if (!dapp) {
          return res.status(401).json({ error: "Invalid API key" });
        }
        
        if (dapp) {
          const dappBalance = BigInt(dapp.balance_wei || 0);
          const freeTierCheck = await db.checkAndUseFreeTier(dapp.id);
          freeTierInfo = freeTierCheck;
          
          const gasEstimate = (
            BigInt(userOperation.callGasLimit) +
            BigInt(userOperation.verificationGasLimit) +
            BigInt(userOperation.preVerificationGas)
          );
          const gasPrice = BigInt(userOperation.maxFeePerGas);
          const costWei = gasEstimate * gasPrice;
          
          await db.recordTransaction(dapp.id, userAddress, gasEstimate, costWei, userOpHash);
          
          if (freeTierCheck.isFree) {
            await db.incrementFreeTierUsage(dapp.id);
            const used = (freeTierCheck.remaining - 1) >= 0 ? (freeTierCheck.remaining - 1) : 0;
            console.log(`[FreeTier] dApp ${dapp.name}: used ${used} of 10 free requests`);
          } else if (dappBalance >= costWei) {
            await db.updateDappBalance(dapp.id, -costWei);
            console.log(`[Usage] dApp ${dapp.name}: ${costWei} wei deducted from balance`);
          } else {
            return res.status(403).json({ 
              error: "Insufficient balance",
              message: "Your free tier is exhausted and you have insufficient balance. Please add funds to continue.",
              remaining: 0,
              upgradeUrl: "/add-funds",
              required: costWei.toString(),
              available: dappBalance.toString()
            });
          }
        }
      } catch (dbError) {
        console.error("[Usage] Failed to log:", dbError);
      }
    }

    res.json({
      paymasterAndData,
      validUntil,
      validAfter,
      hash: userOpHash,
      remaining: rateLimit.remaining,
    });
  } catch (error: any) {
    console.error("Sign error:", error);
    res.status(500).json({ error: "Failed to sign UserOperation" });
  }
});

app.get("/api/paymaster/status/:address", (req: Request, res: Response) => {
  const address = req.params.address;
  const key = `${address}-${new Date().toISOString().split("T")[0]}`;
  const limit = rateLimitMap.get(key);
  
  res.json({
    address,
    dailyUsed: limit?.count || 0,
    dailyLimit: DAILY_TX_LIMIT,
    remaining: limit ? Math.max(0, DAILY_TX_LIMIT - limit.count) : DAILY_TX_LIMIT,
    resetTime: limit?.resetTime ? new Date(limit.resetTime).toISOString() : null,
  });
});

const relayRequestSchema = z.object({
  userOperation: userOpSchema,
  userAddress: z.string(),
});

app.post("/api/v1/relay", async (req: Request, res: Response) => {
  try {
    const validation = relayRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { userOperation, userAddress } = validation.data;

    console.log(`[Relayer] Received UserOp from ${userAddress}`);

    const userOpPacked = [
      userOperation.sender,
      userOperation.nonce,
      userOperation.initCode || "0x",
      userOperation.callData || "0x",
      userOperation.callGasLimit,
      userOperation.verificationGasLimit,
      userOperation.preVerificationGas,
      userOperation.maxFeePerGas,
      userOperation.maxPriorityFeePerGas,
      userOperation.paymasterAndData || "0x",
      userOperation.signature,
    ];

    console.log(`[Relayer] Submitting to EntryPoint...`);

    const EntryPointIface = new ethers.Interface([
      "function handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)",
    ]);

    const txData = EntryPointIface.encodeFunctionData("handleOps", [[userOpPacked], relayerWallet.address]);
    console.log(`[Relayer] Encoding done, sending tx...`);
    
    const sendStart = Date.now();
    const tx = await relayerWallet.sendTransaction({
      to: ENTRY_POINT_ADDRESS,
      data: txData,
      gasLimit: 500000,
    });
    const sendEnd = Date.now();
    console.log(`[Relayer] sendTransaction took ${sendEnd - sendStart}ms`);

    console.log(`[Relayer] Returning tx hash NOW: ${tx.hash} (not waiting for confirm)`);
    // Return immediately - don't wait for confirmation
    // Client can check status via transaction hash
    res.json({
      success: true,
      userOpHash: getUserOpHash(userOperation),
      transactionHash: tx.hash,
      status: "submitted",
      message: "Transaction submitted. Use transactionHash to check confirmation.",
      relayer: relayerWallet.address,
    });
    console.log(`[Relayer] Response sent!`);

    // Background: wait for confirmation and get gas used
    tx.wait()
      .then((receipt) => {
        console.log(`[Relayer] Confirmed! Block: ${receipt?.blockNumber}, Gas: ${receipt?.gasUsed}`);
      })
      .catch((err) => {
        console.error("[Relayer] Confirmation error:", err.message);
      });
  } catch (error: any) {
    console.error("[Relayer] Error:", error.message || error);
    res.status(500).json({ error: "Failed to relay UserOperation", details: error.message });
  }
});

app.get("/api/v1/relayer/status", async (req: Request, res: Response) => {
  try {
    const balance = await provider.getBalance(relayerWallet.address);
    res.json({
      relayer: relayerWallet.address,
      balance: ethers.formatEther(balance),
      balanceWei: balance.toString(),
      entryPoint: ENTRY_POINT_ADDRESS,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to get relayer status" });
  }
});

const registerVerifierSchema = z.object({
  verifierAddress: z.string().startsWith("0x"),
  name: z.string().min(1).max(100),
  dailyLimit: z.number().int().positive().max(10000).default(100),
});

app.post("/api/v1/verifiers/register", async (req: Request, res: Response) => {
  try {
    const validation = registerVerifierSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { verifierAddress, name, dailyLimit } = validation.data;

    if (verifierRegistry.has(verifierAddress)) {
      return res.status(409).json({ error: "Verifier already registered" });
    }

    verifierRegistry.set(verifierAddress, {
      address: verifierAddress,
      name,
      dailyLimit,
      createdAt: Date.now(),
    });

    console.log(`[Signing] Registered new verifier: ${name} (${verifierAddress})`);

    res.json({
      success: true,
      verifier: verifierAddress,
      name,
      dailyLimit,
    });
  } catch (error: any) {
    console.error("[Signing] Register error:", error);
    res.status(500).json({ error: "Failed to register verifier" });
  }
});

app.get("/api/v1/verifiers", (req: Request, res: Response) => {
  const verifiers = Array.from(verifierRegistry.values()).map(v => ({
    address: v.address,
    name: v.name,
    dailyLimit: v.dailyLimit,
  }));
  res.json({ verifiers, count: verifiers.length });
});

app.get("/api/v1/verifiers/:address", (req: Request, res: Response) => {
  const verifier = verifierRegistry.get(req.params.address);
  if (!verifier) {
    return res.status(404).json({ error: "Verifier not found" });
  }
  res.json(verifier);
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dapps", dappRoutes);
app.use("/api/v1/deposits", depositRoutes);

app.listen(PORT, async () => {
  await init();
  console.log(`\n🚀 Conflux Paymaster Signing Service`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Free tier: 10 transactions per API key`);
  console.log(`   Paid: Deductions from dApp balance\n`);
});

app.post("/api/debug/reset-db", async (req: Request, res: Response) => {
  try {
    if (!db.pool) return res.status(500).json({ error: "No database" });
    
    // Reset all tables
    await db.pool.query("TRUNCATE transactions, deposits, dapps RESTART IDENTITY CASCADE");
    
    res.json({ success: true, message: "Database reset - all data cleared" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
