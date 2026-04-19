import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import * as db from "../db/index.js";

const router = Router();

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

router.get("/me", async (req: Request, res: Response) => {
  try {
    const dapp = req.dapp!;
    res.json({
      id: dapp.id,
      owner_address: dapp.owner_address,
      name: dapp.name,
      api_key: dapp.api_key,
      paymaster_address: dapp.paymaster_address,
      balance_wei: dapp.balance_wei.toString(),
      balance_eth: ethers.formatEther(dapp.balance_wei),
      status: dapp.status,
      created_at: dapp.created_at,
    });
  } catch (error: any) {
    console.error("[Dapps] Get me error:", error);
    res.status(500).json({ error: "Failed to get dApp info" });
  }
});

const usageQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

router.get("/me/usage", async (req: Request, res: Response) => {
  try {
    const validation = usageQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid query", details: validation.error.issues });
    }

    const { start_date, end_date } = validation.data;
    const dapp = req.dapp!;

    const startDate = start_date ? new Date(start_date) : undefined;
    const endDate = end_date ? new Date(end_date) : undefined;

    const usage = await db.getDappUsage(dapp.id, startDate, endDate);

    res.json({
      total_transactions: usage.total_transactions,
      total_gas_used: usage.total_gas_used.toString(),
      total_cost_wei: usage.total_cost_wei.toString(),
      total_cost_eth: ethers.formatEther(usage.total_cost_wei),
      period: {
        start_date: startDate?.toISOString() || null,
        end_date: endDate?.toISOString() || null,
      },
    });
  } catch (error: any) {
    console.error("[Dapps] Usage error:", error);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

router.get("/me/deposits", async (req: Request, res: Response) => {
  try {
    const dapp = req.dapp!;
    const deposits = await db.pool?.query(
      "SELECT * FROM deposits WHERE dapp_id = $1 ORDER BY created_at DESC LIMIT 20",
      [dapp.id]
    );

    res.json({
      deposits: deposits?.rows || [],
      count: deposits?.rows?.length || 0,
    });
  } catch (error: any) {
    console.error("[Dapps] Deposits error:", error);
    res.status(500).json({ error: "Failed to get deposits" });
  }
});

export default router;