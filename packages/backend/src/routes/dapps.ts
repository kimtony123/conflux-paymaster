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
      project_name: dapp.project_name,
      project_type: dapp.project_type,
      description: dapp.description,
      api_key: dapp.api_key,
      paymaster_address: dapp.paymaster_address,
      balance_wei: dapp.balance_wei.toString(),
      balance_eth: ethers.formatEther(dapp.balance_wei),
      free_tier_requests: dapp.free_tier_requests || 10,
      free_tier_used: dapp.free_tier_used || 0,
      free_tier_remaining: (dapp.free_tier_requests || 10) - (dapp.free_tier_used || 0),
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

router.get("/me/charts", async (req: Request, res: Response) => {
  try {
    const dapp = req.dapp!;
    const period = parseInt(req.query.days as string) || 7;

    const [dailyUsage, deposits, totals] = await Promise.all([
      db.getDailyUsage(dapp.id, period),
      db.getDepositsByPeriod(dapp.id, period),
      db.getDappUsage(dapp.id)
    ]);

    const spendByPeriod = deposits.reduce((acc, dep) => {
      const existing = acc.find(x => x.date === dep.date);
      if (existing) {
        existing.cost_wei += dep.amount_wei;
      } else {
        acc.push({ date: dep.date, cost_wei: dep.amount_wei, transactions: 0 });
      }
      return acc;
    }, [] as { date: string; cost_wei: bigint; transactions: number }[]);

    const mergedDaily = dailyUsage.map(day => {
      const dep = spendByPeriod.find(d => d.date === day.date);
      return {
        date: day.date,
        transactions: day.transactions,
        gas_cost_eth: ethers.formatEther(day.cost_wei),
        deposit_cost_eth: dep ? ethers.formatEther(dep.cost_wei) : "0"
      };
    });

    const gasSpent = totals.total_cost_wei;
    const depositSpent = deposits.reduce((sum, d) => sum + d.amount_wei, 0n);
    const totalSpent = gasSpent + depositSpent;

    const spendingByCategory = {
      gas_fees: totalSpent > 0n ? Number((gasSpent * 10000n) / totalSpent) / 100 : 0,
      deposits: totalSpent > 0n ? Number((depositSpent * 10000n) / totalSpent) / 100 : 0
    };

    res.json({
      daily: mergedDaily,
      spending_by_category: spendingByCategory,
      totals: {
        transactions: totals.total_transactions,
        gas_spent_eth: ethers.formatEther(gasSpent),
        deposit_spent_eth: ethers.formatEther(depositSpent),
        total_spent_eth: ethers.formatEther(totalSpent)
      },
      period_days: period
    });
  } catch (error: any) {
    console.error("[Dapps] Charts error:", error);
    res.status(500).json({ error: "Failed to get charts data" });
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