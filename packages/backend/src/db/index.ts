import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL not set. Database features disabled.");
}

export const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

export interface Dapp {
  id: string;
  owner_address: string;
  name: string;
  project_name: string;
  project_type: string;
  description: string;
  api_key: string;
  paymaster_address: string | null;
  balance_wei: string;
  free_tier_requests: number;
  free_tier_used: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  dapp_id: string;
  user_address: string;
  user_op_hash: string | null;
  gas_used: bigint | null;
  gas_cost_wei: bigint | null;
  tx_hash: string | null;
  created_at: Date;
}

export interface Deposit {
  id: string;
  dapp_id: string;
  amount_wei: bigint;
  tx_hash: string;
  status: string;
  created_at: Date;
  confirmed_at: Date | null;
}

function generateApiKey(): string {
  return `cfpm_sk_${uuidv4().replace(/-/g, "").substring(0, 56)}`;
}

export async function findDappByOwner(ownerAddress: string): Promise<Dapp | null> {
  if (!pool) return null;
  const result = await pool.query(
    "SELECT * FROM dapps WHERE owner_address = $1 AND status = 'active'",
    [ownerAddress.toLowerCase()]
  );
  return result.rows[0] || null;
}

export async function findDappByApiKey(apiKey: string): Promise<Dapp | null> {
  if (!pool) return null;
  const result = await pool.query(
    "SELECT * FROM dapps WHERE api_key = $1 AND status = 'active'",
    [apiKey]
  );
  return result.rows[0] || null;
}

export async function createDapp(
  ownerAddress: string, 
  projectName: string = "My dApp",
  projectType: string = "Other",
  description: string = ""
): Promise<Dapp> {
  if (!pool) throw new Error("Database not configured");
  
  const apiKey = generateApiKey();
  const result = await pool.query(
    `INSERT INTO dapps (owner_address, project_name, project_type, description, name, api_key, balance_wei, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'active', NOW(), NOW())
     RETURNING *`,
    [ownerAddress.toLowerCase(), projectName, projectType, description, projectName, apiKey]
  );
  return result.rows[0];
}

export async function updateDappDetails(
  dappId: string,
  projectName: string,
  projectType: string,
  description: string
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE dapps SET project_name = $1, project_type = $2, description = $3, updated_at = NOW() WHERE id = $4`,
    [projectName, projectType, description, dappId]
  );
}

export async function getDappById(id: string): Promise<Dapp | null> {
  if (!pool) return null;
  const result = await pool.query("SELECT * FROM dapps WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function updateDappBalance(dappId: string, amount: bigint): Promise<void> {
  if (!pool) return;
  await pool.query(
    "UPDATE dapps SET balance_wei = balance_wei + $1::numeric, updated_at = NOW() WHERE id = $2",
    [amount.toString(), dappId]
  );
}

export async function checkAndUseFreeTier(dappId: string): Promise<{ allowed: boolean; remaining: number; isFree: boolean }> {
  if (!pool) return { allowed: true, remaining: 10, isFree: false };
  
  const result = await pool.query(
    "SELECT free_tier_requests, free_tier_used FROM dapps WHERE id = $1",
    [dappId]
  );
  
  if (result.rows.length === 0) {
    return { allowed: true, remaining: 10, isFree: false };
  }
  
  const { free_tier_requests, free_tier_used } = result.rows[0];
  const remaining = (free_tier_requests || 10) - (free_tier_used || 0);
  
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, isFree: true };
  }
  
  return { allowed: true, remaining, isFree: true };
}

export async function incrementFreeTierUsage(dappId: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    "UPDATE dapps SET free_tier_used = free_tier_used + 1, updated_at = NOW() WHERE id = $1",
    [dappId]
  );
}

export async function recordTransaction(
  dappId: string,
  userAddress: string,
  gasUsed: bigint,
  gasCostWei: bigint,
  userOpHash?: string,
  txHash?: string
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO transactions (dapp_id, user_address, user_op_hash, gas_used, gas_cost_wei, tx_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [dappId, userAddress.toLowerCase(), userOpHash || null, gasUsed, gasCostWei, txHash || null]
  );
}

export async function getDappUsage(
  dappId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ total_transactions: number; total_gas_used: bigint; total_cost_wei: bigint }> {
  if (!pool) return { total_transactions: 0, total_gas_used: 0n, total_cost_wei: 0n };
  
  let query = "SELECT COUNT(*), COALESCE(SUM(gas_used), 0), COALESCE(SUM(gas_cost_wei), 0) FROM transactions WHERE dapp_id = $1";
  const params: any[] = [dappId];
  
  if (startDate) {
    params.push(startDate);
    query += ` AND created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    query += ` AND created_at <= $${params.length}`;
  }
  
  const result = await pool.query(query, params);
  const row = result.rows[0];
  return {
    total_transactions: parseInt(row.count),
    total_gas_used: BigInt(row.coalesce),
    total_cost_wei: BigInt(row.coalesce)
  };
}

export interface DailyUsage {
  date: string;
  transactions: number;
  gas_used: bigint;
  cost_wei: bigint;
}

export async function getDailyUsage(
  dappId: string,
  days: number = 7
): Promise<DailyUsage[]> {
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) as transactions,
       COALESCE(SUM(gas_used), 0) as gas_used,
       COALESCE(SUM(gas_cost_wei), 0) as cost_wei
     FROM transactions 
     WHERE dapp_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [dappId]
  );
  
  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    transactions: parseInt(row.transactions),
    gas_used: BigInt(row.gas_used),
    cost_wei: BigInt(row.cost_wei)
  }));
}

export async function getDepositsByPeriod(
  dappId: string,
  days: number = 30
): Promise<{ date: string; amount_wei: bigint }[]> {
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT 
       DATE(created_at) as date,
       SUM(amount_wei) as amount_wei
     FROM deposits 
     WHERE dapp_id = $1 
       AND status = 'confirmed'
       AND created_at >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [dappId]
  );
  
  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    amount_wei: BigInt(row.amount_wei || 0)
  }));
}

export async function findDepositByTxHash(txHash: string): Promise<Deposit | null> {
  if (!pool) return null;
  const result = await pool.query("SELECT * FROM deposits WHERE tx_hash = $1", [txHash]);
  return result.rows[0] || null;
}

export async function createDeposit(
  dappId: string,
  amountWei: bigint,
  txHash: string
): Promise<Deposit> {
  if (!pool) throw new Error("Database not configured");
  
  const result = await pool.query(
    `INSERT INTO deposits (dapp_id, amount_wei, tx_hash, status, created_at)
     VALUES ($1, $2::numeric, $3, 'confirmed', NOW())
     RETURNING *`,
    [dappId, amountWei.toString(), txHash]
  );
  return result.rows[0];
}

export async function initDatabase(): Promise<void> {
  if (!pool) {
    console.log("📦 Database: Not configured (DATABASE_URL not set)");
    return;
  }
  
  console.log("📦 Database: Initializing schema...");
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dapps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_address VARCHAR(42) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      project_name VARCHAR(255),
      project_type VARCHAR(50),
      description TEXT,
      api_key VARCHAR(64) NOT NULL,
      paymaster_address VARCHAR(42),
      balance_wei NUMERIC DEFAULT 0,
      free_tier_requests INTEGER DEFAULT 10,
      free_tier_used INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

await pool.query(`
  ALTER TABLE dapps ADD COLUMN IF NOT EXISTS project_name VARCHAR(255)
`).catch(() => {});

await pool.query(`ALTER TABLE dapps ADD COLUMN IF NOT EXISTS project_type VARCHAR(50)`).catch(() => {});

await pool.query(`ALTER TABLE dapps ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => {});

await pool.query(`ALTER TABLE dapps ADD COLUMN IF NOT EXISTS free_tier_requests INTEGER DEFAULT 10`).catch(() => {});

await pool.query(`ALTER TABLE dapps ADD COLUMN IF NOT EXISTS free_tier_used INTEGER DEFAULT 0`).catch(() => {});
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dapp_id UUID REFERENCES dapps(id),
      user_address VARCHAR(42) NOT NULL,
      user_op_hash VARCHAR(66),
      gas_used BIGINT,
      gas_cost_wei BIGINT,
      tx_hash VARCHAR(66),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dapp_id UUID REFERENCES dapps(id),
      amount_wei NUMERIC NOT NULL,
      tx_hash VARCHAR(66) UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      confirmed_at TIMESTAMP
    );
  `);
  
  console.log("📦 Database: Schema ready");
}

export default {
  pool,
  findDappByOwner,
  findDappByApiKey,
  createDapp,
  getDappById,
  updateDappBalance,
  recordTransaction,
  getDappUsage,
  findDepositByTxHash,
  createDeposit,
  initDatabase,
};