import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import * as db from "../db/index.js";

const router = Router();

const LOGIN_MESSAGE = "Login to Conflux Paymaster Dashboard";

const loginSchema = z.object({
  address: z.string().startsWith("0x"),
  signature: z.string(),
});

const registerSchema = z.object({
  address: z.string().startsWith("0x"),
  signature: z.string(),
  name: z.string().min(1).max(100),
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { address, signature } = validation.data;

    const recoveredAddress = ethers.verifyMessage(LOGIN_MESSAGE, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    let dapp = await db.findDappByOwner(address);
    if (!dapp) {
      dapp = await db.createDapp(address, "My dApp");
      console.log(`[Auth] Created new dApp for ${address.slice(0, 6)}...`);
    }

    res.json({
      api_key: dapp.api_key,
      dapp_id: dapp.id,
      name: dapp.name,
      message: LOGIN_MESSAGE,
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { address, signature, name } = validation.data;

    const recoveredAddress = ethers.verifyMessage(LOGIN_MESSAGE, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const existing = await db.findDappByOwner(address);
    if (existing) {
      return res.status(409).json({ error: "dApp already registered" });
    }

    const dapp = await db.createDapp(address, name);
    console.log(`[Auth] Registered new dApp: ${name} (${address.slice(0, 6)}...)`);

    res.json({
      api_key: dapp.api_key,
      dapp_id: dapp.id,
      name: dapp.name,
    });
  } catch (error: any) {
    console.error("[Auth] Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.get("/verify", async (req: Request, res: Response) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    return res.status(401).json({ error: "Missing API key" });
  }

  const dapp = await db.findDappByApiKey(apiKey);
  if (!dapp) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  res.json({
    valid: true,
    dapp_id: dapp.id,
    name: dapp.name,
  });
});

export default router;