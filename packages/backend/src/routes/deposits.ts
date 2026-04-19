import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import * as db from "../db/index.js";

const router = Router();

const FEE_WALLET = "0x059c159c1061C3cd082d020e0F77260234A3f523";
const FEE_PERCENT = 2; // 2%

async function authenticate(req: Request, res: Response, next: Function) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    return res.status(401).json({ error: "Missing API key" });
  }

  const dapp = await db.findDappByApiKey(apiKey);
  if (!dapp) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  req.dapp = dapp;
  next();
}

router.use(authenticate);

declare global {
  namespace Express {
    interface Request {
      dapp?: db.Dapp;
    }
  }
}

const prepareDepositSchema = z.object({
  amount: z.string().regex(/^\d+$/).optional(),
});

router.post("/prepare", async (req: Request, res: Response) => {
  try {
    const dapp = req.dapp!;
    const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
    
    if (!PAYMASTER_ADDRESS) {
      return res.status(500).json({ error: "Paymaster not configured" });
    }

    res.json({
      paymaster_address: PAYMASTER_ADDRESS,
      reference: `dapp_${dapp.id.slice(0, 8)}`,
      gas_estimate: 50000,
      fee_percent: FEE_PERCENT,
      instructions: [
        `1. Send CFX to ${PAYMASTER_ADDRESS}`,
        "2. Copy the transaction hash",
        "3. Click 'Verify Deposit' and paste the hash",
      ],
    });
  } catch (error: any) {
    console.error("[Deposits] Prepare error:", error);
    res.status(500).json({ error: "Failed to prepare deposit" });
  }
});

const verifyDepositSchema = z.object({
  tx_hash: z.string().startsWith("0x").length(66),
  amount_wei: z.string().regex(/^\d+$/).optional(),
});

router.post("/verify", async (req: Request, res: Response) => {
  try {
    const validation = verifyDepositSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { tx_hash, amount_wei } = validation.data;
    const dapp = req.dapp!;
    const CONFLUX_RPC_URL = process.env.CONFLUX_RPC_URL || "https://evmtestnet.confluxrpc.com";
    const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(CONFLUX_RPC_URL);

    const relayerWallet = RELAYER_PRIVATE_KEY 
      ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider)
      : null;

    const existing = await db.findDepositByTxHash(tx_hash);
    if (existing) {
      if (existing.dapp_id === dapp.id) {
        return res.json({
          status: existing.status,
          amount_wei: existing.amount_wei.toString(),
          confirmed_at: existing.confirmed_at,
        });
      }
      return res.status(409).json({ error: "Deposit already claimed by another dApp" });
    }

    const tx = await provider.getTransaction(tx_hash);
    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const receipt = await provider.getTransactionReceipt(tx_hash);
    if (!receipt || receipt.status === 0) {
      await db.createDeposit(dapp.id, 0n, tx_hash);
      return res.json({ status: "failed" });
    }

    const totalAmount = amount_wei ? BigInt(amount_wei) : tx.value;
    const feeAmount = (totalAmount * BigInt(FEE_PERCENT)) / 100n;
    const creditAmount = totalAmount - feeAmount;

    if (relayerWallet && feeAmount > 0n) {
      try {
        const feeTx = await relayerWallet.sendTransaction({
          to: FEE_WALLET,
          value: feeAmount,
          gasLimit: 21000,
        });
        await feeTx.wait();
        console.log(`[Deposits] Fee sent: ${ethers.formatEther(feeAmount)} CFX to ${FEE_WALLET}`);
      } catch (feeError: any) {
        console.error("[Deposits] Fee transfer failed:", feeError.message);
      }
    }

    await db.createDeposit(dapp.id, creditAmount, tx_hash);
    await db.updateDappBalance(dapp.id, creditAmount);

    console.log(`[Deposits] Verified: ${ethers.formatEther(creditAmount)} CFX credited (deposit: ${ethers.formatEther(totalAmount)} CFX, fee: ${ethers.formatEther(feeAmount)} CFX) for dApp ${dapp.name}`);

    res.json({
      status: "confirmed",
      amount_wei: creditAmount.toString(),
      amount_eth: ethers.formatEther(creditAmount),
      total_deposited: ethers.formatEther(totalAmount),
      fee_paid: ethers.formatEther(feeAmount),
      tx_hash,
    });
  } catch (error: any) {
    console.error("[Deposits] Verify error:", error);
    res.status(500).json({ error: "Failed to verify deposit" });
  }
});

export default router;