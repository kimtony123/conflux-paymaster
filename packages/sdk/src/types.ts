export interface PaymasterConfig {
  rpcUrl: string;
  paymasterAddress: string;
  signingServiceUrl: string;
  chainId: 71 | 1030;
  entryPointAddress?: string;
  apiKey?: string;
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

export interface WalletSigner {
  address: string;
  signMessage: (message: string | Uint8Array) => Promise<string>;
}

export type UserSigner = WalletSigner | string;

export const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

export const DEFAULT_RPC_URLS: Record<"testnet" | "mainnet", string> = {
  testnet: "https://evmtestnet.confluxrpc.com",
  mainnet: "https://evm.confluxrpc.com",
};