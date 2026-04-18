import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || "";
const CONFLUX_RPC_URL = process.env.CONFLUX_RPC_URL || "https://evmtestnet.confluxrpc.com";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "71");
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const DAILY_TX_LIMIT = parseInt(process.env.DAILY_TX_LIMIT || "100");
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let paymaster: ethers.Contract;

function init() {
  if (!PAYMASTER_ADDRESS || !SIGNER_PRIVATE_KEY) {
    console.error("Missing required environment variables:");
    console.error("  PAYMASTER_ADDRESS:", !!PAYMASTER_ADDRESS);
    console.error("  SIGNER_PRIVATE_KEY:", !!SIGNER_PRIVATE_KEY);
    process.exit(1);
  }

  provider = new ethers.JsonRpcProvider(CONFLUX_RPC_URL);
  signer = new ethers.Wallet(SIGNER_PRIVATE_KEY, provider);
  
  const paymasterABI = [
    "function getHash((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes) userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)",
    "function validatePaymasterUserOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes) userOp, bytes32 userOpHash, uint256 missingAccountFunds) returns (bytes memory context, uint256 validationData)",
  ];
  
  paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterABI, provider);
  
  console.log("Backend signing service initialized:");
  console.log("  Paymaster:", PAYMASTER_ADDRESS);
  console.log("  Signer:", signer.address);
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

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  init();
  console.log(`\n🚀 Conflux Paymaster Signing Service`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Rate limit: ${DAILY_TX_LIMIT} transactions/day\n`);
});

export default app;
