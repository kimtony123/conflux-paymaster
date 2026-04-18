export interface PaymasterConfig {
  rpcUrl: string;
  paymasterAddress: string;
  signingServiceUrl: string;
  chainId: 71 | 1030;
  bundlerUrl?: string;
  entryPointAddress?: string;
}

export interface SponsoredTransaction {
  to: string;
  data?: string;
  value?: bigint;
}

export interface SponsoredTransactionResult {
  userOpHash: string;
  txHash?: string;
  success: boolean;
}

export interface SmartAccountConfig {
  owner: string;
  index?: bigint;
}

export interface UserOperation {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: string;
  signature: string;
}

export interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface PaymasterQuote {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasPrice: string;
}

export interface PaymasterSignResponse {
  paymasterAndData: string;
  validUntil: number;
  validAfter: number;
  hash: string;
  remaining: number;
}

export interface BundlerResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: {
    code: number;
    message: string;
  };
}

export interface UserOpReceipt {
  userOpHash: string;
  success: boolean;
  txHash: string;
  gasUsed: string;
  actualGasUsed: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export type ConfluxChain = "testnet" | "mainnet";

export interface SDKError extends Error {
  code?: number;
  details?: any;
}

export const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

export const DEFAULT_BUNDLER_URLS: Record<ConfluxChain, string> = {
  testnet: "https://api.stackup.sh/v1/bundler/public",
  mainnet: "https://api.stackup.sh/v1/bundler/public",
};

export const DEFAULT_RPC_URLS: Record<ConfluxChain, string> = {
  testnet: "https://evmtestnet.confluxrpc.com",
  mainnet: "https://evm.confluxrpc.com",
};
