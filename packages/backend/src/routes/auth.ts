import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import * as db from "../db/index.js";

const router = Router();

const LOGIN_MESSAGE = "Login to Conflux Paymaster";

const loginSchema = z.object({
  address: z.string().startsWith("0x"),
  signature: z.string(),
});

const registerSchema = z.object({
  address: z.string().startsWith("0x"),
  project_name: z.string().min(1).max(100),
  project_type: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
});

router.post("/register", async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { address, project_name, project_type, description } = validation.data;

    const existing = await db.findDappByOwner(address);
    if (existing) {
      return res.status(409).json({ error: "dApp already registered" });
    }

    const dapp = await db.createDapp(address, project_name, project_type, description || "");
    console.log(`[Auth] Registered new dApp: ${project_name} (${project_type}) - ${address.slice(0, 6)}...`);

    res.json({
      success: true,
      api_key: dapp.api_key,
      dapp_id: dapp.id,
      project_name: dapp.project_name,
      project_type: dapp.project_type,
    });
  } catch (error: any) {
    console.error("[Auth] Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address || !address.startsWith("0x")) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const dapp = await db.findDappByOwner(address);
    if (!dapp) {
      return res.json({ isRegistered: false });
    }

    res.json({
      isRegistered: true,
      id: dapp.id,
      api_key: dapp.api_key,
      project_name: dapp.project_name,
      project_type: dapp.project_type,
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ error: "Login failed" });
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
    project_name: dapp.project_name,
    project_type: dapp.project_type,
  });
});

export default router;