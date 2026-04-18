Understood. The distinction is clear: **Conflux Paymaster** is the infrastructure/SDK you are building for the ecosystem. **AxPesa** is the first customer dApp that will consume it. This is a much more scalable approach. Building a reusable SDK means you need to think about developer experience, abstraction, and ease of integration above all else.

Here is the complete, step-by-step guide to building the `@conflux-paymaster/sdk` from scratch, designed specifically so that a team like AxPesa can integrate gasless transactions with just a few lines of code.

---

# Building the Conflux Paymaster SDK

> A reusable, open-source SDK that enables any Conflux eSpace dApp to sponsor gas fees for its users.

## Phase 1: SDK Architecture & Core Principles

The SDK must solve **one problem** for developers: _"I want my users to transact without owning CFX."_

To achieve this, the SDK will abstract:

| Complexity                          | SDK Abstraction                  |
| :---------------------------------- | :------------------------------- |
| ERC-4337 UserOperation construction | `paymaster.sendTransaction(tx)`  |
| Paymaster signature fetching        | Automatic backend call           |
| Bundler submission                  | Configurable RPC endpoint        |
| Gas estimation & limits             | Automatic calculation            |
| Smart Account creation              | `paymaster.createSmartAccount()` |

### SDK Folder Structure

```
conflux-paymaster-sdk/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── paymaster-client.ts      # Core client class
│   ├── smart-account.ts         # Smart account management
│   ├── bundler.ts               # Bundler communication
│   ├── types.ts                 # TypeScript definitions
│   └── utils/
│       ├── userop.ts            # UserOperation helpers
│       └── signatures.ts        # EIP-712 signing
├── contracts/
│   └── VerifyingPaymaster.sol   # Reference implementation (optional)
├── examples/
│   ├── nextjs/                  # Example Next.js integration
│   └── node/                    # Simple Node.js script
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## Phase 2: Core SDK Implementation

### Step 2.1: Initialize the Project

```bash
mkdir conflux-paymaster-sdk
cd conflux-paymaster-sdk
npm init -y
npm install viem permissionless
npm install --save-dev typescript @types/node tsup
```

Configure `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 2.2: Define Types (`src/types.ts`)

```typescript
import { Address, Hash, Hex } from "viem";

export interface PaymasterConfig {
  /** Conflux eSpace RPC URL */
  rpcUrl: string;
  /** Your Paymaster contract address */
  paymasterAddress: Address;
  /** Your backend signing service URL */
  signingServiceUrl: string;
  /** Chain ID (71 for testnet, 1030 for mainnet) */
  chainId: 71 | 1030;
  /** Bundler RPC URL (optional, defaults to public) */
  bundlerUrl?: string;
  /** EntryPoint address (defaults to v0.7 canonical) */
  entryPointAddress?: Address;
}

export interface SponsoredTransaction {
  to: Address;
  data?: Hex;
  value?: bigint;
}

export interface SponsoredTransactionResult {
  userOpHash: Hash;
  txHash?: Hash;
  success: boolean;
}

export interface SmartAccountConfig {
  owner: Address | Hex; // EOA address or private key
  index?: bigint; // For deterministic account creation
}
```

### Step 2.3: Core Client Class (`src/paymaster-client.ts`)

This is the main class developers will instantiate.

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  Address,
  Hex,
  encodeFunctionData,
  PublicClient,
  WalletClient,
} from "viem";
import { privateKeyToAccount, PrivateKeyAccount } from "viem/accounts";
import { confluxESpaceTestnet, confluxESpace } from "viem/chains";
import {
  PaymasterConfig,
  SponsoredTransaction,
  SponsoredTransactionResult,
  SmartAccountConfig,
} from "./types";
import { SmartAccountManager } from "./smart-account";
import { BundlerClient } from "./bundler";
import {
  buildUserOperation,
  signUserOperation,
  getUserOperationHash,
} from "./utils/userop";

export class ConfluxPaymaster {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private config: PaymasterConfig;
  private bundler: BundlerClient;
  private smartAccountManager: SmartAccountManager;

  constructor(config: PaymasterConfig) {
    this.config = {
      entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      bundlerUrl: "https://api.stackup.sh/v1/bundler/public", // Public testnet bundler
      ...config,
    };

    const chain = config.chainId === 71 ? confluxESpaceTestnet : confluxESpace;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    this.bundler = new BundlerClient(this.config.bundlerUrl!);
    this.smartAccountManager = new SmartAccountManager(
      this.publicClient,
      this.config,
    );
  }

  /**
   * Initialize with a user's wallet (e.g., from window.ethereum or private key).
   */
  async connect(wallet: any) {
    if (typeof wallet === "string") {
      // Private key provided
      const account = privateKeyToAccount(wallet as Hex);
      this.walletClient = createWalletClient({
        account,
        chain: this.publicClient.chain,
        transport: http(this.config.rpcUrl),
      });
    } else {
      // Browser provider (e.g., MetaMask)
      this.walletClient = createWalletClient({
        account: wallet.selectedAddress,
        chain: this.publicClient.chain,
        transport: http(this.config.rpcUrl),
      });
    }
    return this;
  }

  /**
   * Create or retrieve a smart account for the connected user.
   */
  async getSmartAccount(config?: SmartAccountConfig): Promise<Address> {
    const owner = config?.owner || this.walletClient.account?.address;
    if (!owner) throw new Error("No owner provided and wallet not connected");
    return this.smartAccountManager.getOrCreateAccount(owner, config?.index);
  }

  /**
   * Send a gasless transaction.
   */
  async sendTransaction(
    tx: SponsoredTransaction,
  ): Promise<SponsoredTransactionResult> {
    if (!this.walletClient.account) {
      throw new Error("Call connect() first with a wallet or private key");
    }

    const smartAccount = await this.getSmartAccount();
    const user = this.walletClient.account.address;

    // 1. Build the base UserOperation
    let userOp = await buildUserOperation(
      this.publicClient,
      smartAccount,
      tx.to,
      tx.data || "0x",
      tx.value || 0n,
      this.config.entryPointAddress!,
    );

    // 2. Request paymaster signature from backend
    const paymasterAndData = await this.fetchPaymasterSignature(userOp, user);
    userOp.paymasterAndData = paymasterAndData;

    // 3. Sign the UserOperation with the user's EOA key
    const signature = await signUserOperation(
      this.walletClient,
      userOp,
      this.config.entryPointAddress!,
      this.publicClient.chain.id,
    );
    userOp.signature = signature;

    // 4. Submit to bundler
    const userOpHash = await this.bundler.sendUserOperation(
      userOp,
      this.config.entryPointAddress!,
    );

    // 5. Wait for transaction inclusion (optional)
    const receipt = await this.bundler.waitForUserOperationReceipt(userOpHash);

    return {
      userOpHash,
      txHash: receipt?.transactionHash,
      success: receipt?.success ?? false,
    };
  }

  /**
   * Fetch paymaster signature from the backend signing service.
   */
  private async fetchPaymasterSignature(
    userOp: any,
    userAddress: Address,
  ): Promise<Hex> {
    const response = await fetch(
      `${this.config.signingServiceUrl}/api/paymaster/sign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userOperation: userOp, userAddress }),
      },
    );

    if (!response.ok) {
      throw new Error(`Paymaster signing failed: ${await response.text()}`);
    }

    const data = await response.json();
    return data.paymasterAndData;
  }
}
```

### Step 2.4: Smart Account Manager (`src/smart-account.ts`)

```typescript
import {
  PublicClient,
  Address,
  Hex,
  encodeFunctionData,
  decodeEventLog,
  parseAbi,
} from "viem";
import { PaymasterConfig } from "./types";

const SIMPLE_ACCOUNT_FACTORY_ABI = parseAbi([
  "function createAccount(address owner, uint256 salt) returns (address)",
  "function getAddress(address owner, uint256 salt) view returns (address)",
  "event AccountCreated(address indexed account, address indexed owner, uint256 salt)",
]);

const SIMPLE_ACCOUNT_ABI = parseAbi([
  "function execute(address target, uint256 value, bytes data)",
]);

export class SmartAccountManager {
  private factoryAddress?: Address;

  constructor(
    private publicClient: PublicClient,
    private config: PaymasterConfig,
  ) {
    // You would deploy a SimpleAccountFactory on Conflux eSpace
    // For now, we assume it exists at a known address.
  }

  async getOrCreateAccount(
    owner: Address,
    salt: bigint = 0n,
  ): Promise<Address> {
    const predictedAddress = await this.getAddress(owner, salt);
    const code = await this.publicClient.getBytecode({
      address: predictedAddress,
    });

    if (code && code !== "0x") {
      return predictedAddress;
    }

    // Account not deployed; we need to deploy it
    // This transaction would be paid by the user (or sponsored separately)
    return this.createAccount(owner, salt);
  }

  async getAddress(owner: Address, salt: bigint): Promise<Address> {
    return this.publicClient.readContract({
      address: this.factoryAddress!,
      abi: SIMPLE_ACCOUNT_FACTORY_ABI,
      functionName: "getAddress",
      args: [owner, salt],
    }) as Promise<Address>;
  }

  async createAccount(owner: Address, salt: bigint): Promise<Address> {
    const hash = await this.publicClient.sendTransaction({
      to: this.factoryAddress!,
      data: encodeFunctionData({
        abi: SIMPLE_ACCOUNT_FACTORY_ABI,
        functionName: "createAccount",
        args: [owner, salt],
      }),
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Find the AccountCreated event
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === this.factoryAddress?.toLowerCase(),
    );
    if (!log) throw new Error("Account creation failed");

    const decoded = decodeEventLog({
      abi: SIMPLE_ACCOUNT_FACTORY_ABI,
      data: log.data,
      topics: log.topics,
      eventName: "AccountCreated",
    });

    return decoded.args.account;
  }
}
```

### Step 2.5: Bundler Client (`src/bundler.ts`)

```typescript
import { Address, Hash, Hex } from "viem";

interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

export class BundlerClient {
  constructor(private bundlerUrl: string) {}

  async sendUserOperation(
    userOp: UserOperation,
    entryPoint: Address,
  ): Promise<Hash> {
    const response = await fetch(this.bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, entryPoint],
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`Bundler error: ${data.error.message}`);
    }
    return data.result;
  }

  async getUserOperationReceipt(userOpHash: Hash): Promise<any> {
    const response = await fetch(this.bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [userOpHash],
      }),
    });
    const data = await response.json();
    return data.result;
  }

  async waitForUserOperationReceipt(
    userOpHash: Hash,
    timeout: number = 60000,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const receipt = await this.getUserOperationReceipt(userOpHash);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Timeout waiting for UserOperation receipt");
  }
}
```

### Step 2.6: UserOperation Utilities (`src/utils/userop.ts`)

```typescript
import {
  PublicClient,
  WalletClient,
  Address,
  Hex,
  encodeAbiParameters,
  keccak256,
  concat,
  toHex,
  encodeFunctionData,
  parseAbi,
} from "viem";

export async function buildUserOperation(
  publicClient: PublicClient,
  sender: Address,
  target: Address,
  data: Hex,
  value: bigint,
  entryPointAddress: Address,
) {
  const nonce = await publicClient.readContract({
    address: entryPointAddress,
    abi: parseAbi([
      "function getNonce(address,uint192) view returns (uint256)",
    ]),
    functionName: "getNonce",
    args: [sender, 0n],
  });

  const callData = encodeFunctionData({
    abi: parseAbi(["function execute(address,uint256,bytes)"]),
    functionName: "execute",
    args: [target, value, data],
  });

  return {
    sender,
    nonce: BigInt(nonce),
    initCode: "0x",
    callData,
    callGasLimit: 200000n,
    verificationGasLimit: 200000n,
    preVerificationGas: 50000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: "0x",
    signature: "0x",
  };
}

export async function signUserOperation(
  walletClient: WalletClient,
  userOp: any,
  entryPointAddress: Address,
  chainId: number,
): Promise<Hex> {
  const packed = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      userOp.sender,
      userOp.nonce,
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      keccak256(userOp.paymasterAndData),
    ],
  );
  const userOpHash = keccak256(packed);
  const finalHash = keccak256(
    concat([userOpHash, entryPointAddress, toHex(chainId, { size: 32 })]),
  );

  return walletClient.signMessage({ message: { raw: finalHash } });
}
```

---

## Phase 3: Backend Signing Service (Required for SDK)

The SDK expects a backend endpoint at `signingServiceUrl`. Here is a minimal production-ready implementation:

```javascript
// backend/index.js
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const CHAIN_ID = 71; // or 1030 for mainnet
const RATE_LIMIT = new Map();

app.post("/api/paymaster/sign", async (req, res) => {
  try {
    const { userOperation, userAddress } = req.body;

    // Rate limiting (10 txs per user per day)
    const key = `${userAddress}-${new Date().toISOString().split("T")[0]}`;
    const count = RATE_LIMIT.get(key) || 0;
    if (count > 10) {
      return res.status(429).json({ error: "Daily limit exceeded" });
    }
    RATE_LIMIT.set(key, count + 1);

    // Compute hash to sign
    const provider = new ethers.JsonRpcProvider(process.env.CONFLUX_RPC_URL);
    const paymaster = new ethers.Contract(
      PAYMASTER_ADDRESS,
      [
        "function getHash((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes) userOp) view returns (bytes32)",
      ],
      provider,
    );
    const hash = await paymaster.getHash(userOperation);

    const signer = new ethers.Wallet(SIGNER_PRIVATE_KEY);
    const signature = await signer.signMessage(ethers.getBytes(hash));

    const paymasterAndData = ethers.solidityPacked(
      ["address", "bytes"],
      [PAYMASTER_ADDRESS, signature],
    );

    res.json({ paymasterAndData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(3001);
```

---

## Phase 4: Publishing the SDK

### Build Configuration (`tsup.config.ts`)

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

### Package.json Scripts

```json
{
  "name": "@conflux-paymaster/sdk",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "viem": "^2.0.0"
  }
}
```

### Publish to npm

```bash
npm login
npm publish --access public
```

---

## Phase 5: How AxPesa Would Use the SDK

Here is exactly how the AxPesa team would integrate your SDK:

```typescript
import { ConfluxPaymaster } from "@conflux-paymaster/sdk";

const paymaster = new ConfluxPaymaster({
  rpcUrl: "https://evmtestnet.confluxrpc.com",
  paymasterAddress: "0xYOUR_PAYMASTER_ADDRESS",
  signingServiceUrl: "https://paymaster-api.axpesa.com",
  chainId: 71,
});

// Connect with user's wallet (e.g., from Web3Auth)
await paymaster.connect(userPrivateKey);

// Send a gasless transaction (e.g., transfer AxCNH)
const result = await paymaster.sendTransaction({
  to: "0xAxCNHContractAddress",
  data: encodeTransferData(recipient, amount),
});

console.log(`Transaction sent! UserOp Hash: ${result.userOpHash}`);
```

---

## Summary: What You Need to Build

| Component                   | Deliverable                                                          |
| :-------------------------- | :------------------------------------------------------------------- |
| **SDK NPM Package**         | `@conflux-paymaster/sdk` published to npm                            |
| **Backend Signing Service** | Deployed API (e.g., on Railway)                                      |
| **Smart Contracts**         | VerifyingPaymaster + SimpleAccountFactory deployed on Conflux eSpace |
| **Documentation**           | README with quickstart, API reference, examples                      |
| **Example dApp**            | A minimal demo showing AxCNH transfer without gas                    |

This approach positions **Conflux Paymaster** as the go-to infrastructure for gasless transactions on Conflux eSpace, with AxPesa as the flagship user. The SDK abstracts all the complexity you've been researching, making it trivial for any African fintech to onboard users without forcing them to buy CFX.

If you need help with any specific piece (e.g., the `SimpleAccountFactory` deployment or the backend deployment), let me know.
