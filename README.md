# Conflux Paymaster SDK

<p align="center">
  <img src="https://raw.githubusercontent.com/conflux-paymaster/conflux-paymaster/main/packages/sdk/examples/nextjs/public/logo.jpg" alt="Conflux Paymaster SDK Logo" width="200"/>
</p>

> Gasless Transactions for Conflux eSpace. Build dApps that anyone can use.

**Status**: Implementation Complete - Ready for Deployment

License: MIT

---

## Overview

The **Conflux Paymaster SDK** is an open-source TypeScript library that enables any Conflux eSpace dApp to sponsor gas fees for its users. Built on the ERC-4337 Account Abstraction standard, it eliminates the single biggest barrier to Web3 adoption: requiring users to hold CFX just to transact.

**The Mission:** Make blockchain interactions invisible. Users should focus on what they want to do—buy stablecoins, trade NFTs, play games—not on acquiring gas tokens.

**How It Works:** The SDK wraps complex ERC-4337 operations into a simple, promise-based API. It handles smart account creation, UserOperation construction, bundler communication, and paymaster signature orchestration.

---

## 🚀 Problem Statement

### The Gas Fee Barrier

For developers building on Conflux eSpace, user onboarding is broken:

1.  **The CFX Requirement**: Every new user must acquire CFX from an exchange or faucet before they can perform their first transaction. This creates immediate friction and drop-off.
2.  **Conceptual Overload**: Users are forced to understand "gas," "gwei," and "network fees" before they've even experienced the dApp's value.
3.  **Missed Opportunities**: For fintechs like AxPesa, this barrier prevents African users from seamlessly buying stablecoins with mobile money. The user journey stalls at "Insufficient CFX balance."
4.  **Complexity for Developers**: Implementing gas sponsorship from scratch requires deep knowledge of ERC-4337, bundler infrastructure, and secure key management.

### Who Benefits

- **Fintech Applications**: Enable users to swap local currency for stablecoins without ever touching CFX.
- **Gaming dApps**: Onboard players instantly with free in-game actions.
- **NFT Marketplaces**: Allow new collectors to claim or mint their first NFT gas-free.
- **DAO & Governance**: Remove barriers to voting and participation.

---

## 💡 Solution

### Our Approach

The Conflux Paymaster SDK provides a **complete, production-ready abstraction layer** for gasless transactions. It is designed to be:

- **Simple**: A single `sendTransaction` method replaces hundreds of lines of custom code.
- **Secure**: Sensitive paymaster signing keys live in a backend service, never exposed to the client.
- **Flexible**: Works with any ERC-4337 smart account and supports custom bundler configurations.
- **Conflux Native**: Pre-configured for Conflux eSpace testnet (71) and mainnet (1030).

### Core Features

| Feature                      | Description                                                                        |
| :--------------------------- | :--------------------------------------------------------------------------------- |
| **Gasless Transactions**     | Send transactions where the dApp pays the CFX gas fee.                             |
| **Smart Account Management** | Automatically create or retrieve ERC-4337 smart accounts for users.                |
| **TypeScript First**         | Full type safety and IntelliSense support.                                         |
| **Bundler Agnostic**         | Use public bundlers for development or point to your own Alto instance.            |
| **Modular Backend Signer**   | Reference implementation for the required signature service included.              |
| **Wallet Flexible**          | Works with private keys, browser wallets (MetaMask), or Web3Auth embedded wallets. |
| **Developer Portal**         | Sign up, deposit CFX, get API keys, track usage.                                   |

---

## 🔐 Developer Portal

Get your API keys at [https://conflux-paymaster-docs.vercel.app](https://conflux-paymaster-docs.vercel.app)

The Developer Portal allows developers to:
- **Sign Up / Login** - Create your account
- **Deposit CFX** - Fund your paymaster account
- **Get API Keys** - Obtain your unique API key for the SDK
- **Track Usage** - Monitor your transaction usage and balance

```
┌─────────────────────────────────────────────────────────┐
│              DEVELOPER PORTAL                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Sign Up   │  │  Deposit   │  │  Get API    │    │
│  │   / Login   │→ │    CFX      │→ │    Keys     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                         ↓                               │
│                  ┌─────────────┐                       │
│                  │   Dashboard │                       │
│                  │ - Usage Stats│                       │
│                  │ - API Keys   │                       │
│                  │ - Balance    │                       │
│                  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DEVELOPER'S dApp                               │
│                                                                          │
│   import { ConfluxPaymaster } from '@conflux-paymaster/sdk';            │
│   await paymaster.sendTransaction({ to: tokenAddress, data: ... });         │
└───────────────────────────────────────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              CONFLUX PAYMASTER SDK (Client)                       │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Smart Account   │  │ UserOp Builder  │  │   Relayer Client        │  │
│  │   Manager       │  │   & Signer      │  │   (eth_sendUserOp)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┬─────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌─────────────────────────────┐           ┌─────────────────────────────┐
│   SIGNING SERVICE (API)     │           │      RELAYER SERVICE        │
│                             │           │                             │
│  - Signs paymasterAndData    │           │  - Has wallet with CFX       │
│  - Rate limiting            │           │  - Submits to EntryPoint     │
│  - Verifier registry       │           │  - Gets reimbursed         │
└─────────────────────────────┘           └──────────────┬──────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │    CONFLUX eSPACE NETWORK    │
                                           │                             │
                                           │  EntryPoint → Paymaster →   │
                                           │  Smart Account → Target    │
                                           └─────────────────────────────┘
```

### Multi-Tenant Gas sponsorship Flow

1.  **dApp calls** `paymaster.sendTransaction()`
2.  **SDK builds** a `UserOperation` for user's smart account
3.  **Signing Service** receives, validates, signs paymaster signature
4.  **Relayer Service** receives fully-signed UserOp
5.  **Relayer wallet** (has CFX) submits to EntryPoint
6.  **EntryPoint** executes - charges paymaster deposit
7.  **Paymaster** reimburses relayer from its deposit

**KEY PROOF:** On April 19, 2026, the sender's CFX balance was **unchanged** (0.20302872... → 0.20302872...) after a successful gasless USDT transfer!

---

## 📦 Installation

### npm

```bash
npm install @conflux-paymaster/sdk viem ethers
```

### JSR (Deno/Bun)

```bash
# Bun
bun add @conflux-paymaster/conflux-paymaster-sdk

# Deno
deno add @conflux-paymaster/conflux-paymaster-sdk
```

---

## ⚡ Quickstart

### 1. Initialize the SDK

```typescript
import { ConfluxPaymaster } from "@conflux-paymaster/sdk";

const paymaster = new ConfluxPaymaster({
  // Your dApp's configuration
  rpcUrl: "https://evmtestnet.confluxrpc.com",
  paymasterAddress: "0xYOUR_DEPLOYED_PAYMASTER_ADDRESS",
  signingServiceUrl: "https://your-backend.com/api/paymaster",
  chainId: 71, // 71 for testnet, 1030 for mainnet
  // Optional: Use your own bundler
  bundlerUrl: "https://your-alto-bundler.com/rpc",
});
```

### 2. Connect a User

```typescript
// Option A: Using a private key (e.g., from Web3Auth embedded wallet)
await paymaster.connect(userPrivateKey);

// Option B: Using a browser wallet (e.g., MetaMask)
import { createWalletClient, custom } from "viem";
import { confluxESpaceTestnet } from "viem/chains";

const walletClient = createWalletClient({
  chain: confluxESpaceTestnet,
  transport: custom(window.ethereum),
});
await paymaster.connect(walletClient);
```

### 3. Send a Gasless Transaction

```typescript
import { encodeFunctionData, parseAbi } from "viem";

// Example: Transfer an ERC-20 token
const transferData = encodeFunctionData({
  abi: parseAbi(["function transfer(address to, uint256 amount)"]),
  functionName: "transfer",
  args: ["0xRecipientAddress", 1000000000000000000n], // 1 token
});

const result = await paymaster.sendTransaction({
  to: "0xTokenContractAddress",
  data: transferData,
});

console.log(`UserOp Hash: ${result.userOpHash}`);
console.log(`Tx Hash: ${result.txHash}`); // After inclusion
```

That's it. The user never sees a gas fee prompt.

---

## 🖥️ Running Locally

This guide explains how to run the Conflux Paymaster system locally for development and testing.

### Prerequisites

- Node.js 18+
- npm or bun
- Git

### 1. Clone and Install

```bash
git clone https://github.com/conflux-paymaster/conflux-paymaster.git
cd conflux-paymaster
npm install
```

### 2. Configure Environment

Create `.env` files for the packages you need:

**Backend (.env):**
```bash
# packages/backend/.env
PAYMASTER_ADDRESS=0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B
SIGNER_PRIVATE_KEY=0x...your-private-key
CONFLUX_RPC_URL=https://evmtestnet.confluxrpc.com
CHAIN_ID=71
API_KEY=your-api-key
```

**SDK Test (.env):**
```bash
# packages/sdk/test/.env (or conflux-test/)
RPC_URL=https://evmtestnet.confluxrpc.com
PAYMASTER_ADDRESS=0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B
SIGNING_SERVICE_URL=http://localhost:3001
```

### 3. Run the Backend

```bash
cd packages/backend
npm install  # if not done
npm run dev
```

The backend should start on `http://localhost:3001`. Use `--watch` flag:
```bash
npm run dev -- --watch
```

### 4. Run SDK Tests

We provide a test project at `/conflux-test/` showing how to integrate:

```bash
# From the conflux-paymaster repo root:
cd ../conflux-test  # or: cd /home/tony/conflux-test

# Run the test file
node test/gasless-transfer.ts
```

Or run directly with bun/node:
```bash
bun test/gasless-transfer.ts
# or
node test/gasless-transfer.ts
```

**Test file example:**
```typescript
import { ConfluxPaymaster } from "@conflux-paymaster/sdk";

const paymaster = new ConfluxPaymaster({
  rpcUrl: "https://evmtestnet.confluxrpc.com",
  paymasterAddress: "0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B",
  signingServiceUrl: "http://localhost:3001",
  chainId: 71,
  apiKey: "your-api-key",
});

await paymaster.connect("0xUSER_PRIVATE_KEY");
await paymaster.setFactory("0xFactoryAddress");

const result = await paymaster.sendTransaction({
  to: "0xRecipient",
  data: "0x",
  value: 1n * 10n**18n, // 1 CFX
});

console.log("UserOp Hash:", result.userOpHash);
```

### 5. (Optional) Deploy Contracts

If you need to deploy your own contracts to testnet:

```bash
cd packages/contracts
cp .env.example .env
# Edit .env with your private key
npm run deploy:testnet
```

### Deployed Testnet Addresses

| Contract | Address |
|----------|---------|
| EntryPoint | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| SimpleAccountFactory | `0x3d536eA50c323fFA2bc6b7DF0c1AE253f6144eAE` |
| VerifyingPaymaster | `0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B` |

---

## 🛠️ Smart Contract Deployment

Before using the SDK, you must deploy the **VerifyingPaymaster** contract and (optionally) a **SimpleAccountFactory**. We provide a reference implementation.

### Deploy Paymaster Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract VerifyingPaymaster is Ownable {
    // ... (full implementation available in /contracts)
}
```

**Deployment Steps:**

1.  Clone the repository: `git clone https://github.com/your-org/conflux-paymaster-sdk.git`
2.  Install dependencies: `npm install`
3.  Configure Hardhat for Conflux eSpace (see `/hardhat.config.ts`)
4.  Deploy:
    ```bash
    npx hardhat run scripts/deploy-paymaster.ts --network confluxTestnet
    ```
5.  Fund the paymaster by sending CFX to the deployed address and calling `deposit()`.

---

## 🔧 Backend Signing Service

The SDK requires a backend endpoint that signs paymaster data. This keeps the signing key secure.

### Reference Implementation (Node.js/Express)

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
const CHAIN_ID = 71;

app.post("/api/paymaster/sign", async (req, res) => {
  try {
    const { userOperation, userAddress } = req.body;

    // --- Rate Limiting & Validation ---
    // Implement your own logic here (e.g., check whitelist, daily limits)

    // --- Compute Hash & Sign ---
    const hash = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "uint256"],
      [userOpHash, PAYMASTER_ADDRESS, CHAIN_ID],
    );
    const signer = new ethers.Wallet(SIGNER_PRIVATE_KEY);
    const signature = await signer.signMessage(ethers.getBytes(hash));

    const paymasterAndData = ethers.solidityPacked(
      ["address", "bytes"],
      [PAYMASTER_ADDRESS, signature],
    );

    res.json({ paymasterAndData });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3001);
```

### Environment Variables

```env
PAYMASTER_ADDRESS=0x...
SIGNER_PRIVATE_KEY=0x...
CONFLUX_RPC_URL=https://evmtestnet.confluxrpc.com
```

---

## 📚 API Reference

### `ConfluxPaymaster` Class

#### Constructor

```typescript
new ConfluxPaymaster(config: PaymasterConfig)
```

| Parameter           | Type         | Description                                                        |
| :------------------ | :----------- | :----------------------------------------------------------------- |
| `rpcUrl`            | `string`     | Conflux eSpace RPC endpoint.                                       |
| `paymasterAddress`  | `Address`    | Deployed VerifyingPaymaster contract address.                      |
| `signingServiceUrl` | `string`     | URL of your backend signing service.                               |
| `chainId`           | `71 \| 1030` | Testnet (71) or Mainnet (1030).                                    |
| `bundlerUrl`        | `string`     | (Optional) Custom bundler RPC. Defaults to public testnet bundler. |
| `entryPointAddress` | `Address`    | (Optional) EntryPoint address. Defaults to canonical v0.7.         |

#### Methods

| Method                     | Description                                                                     |
| :------------------------- | :------------------------------------------------------------------------------ |
| `connect(wallet)`          | Connect a user's wallet (private key, viem WalletClient, or EIP-1193 provider). |
| `getSmartAccount(config?)` | Retrieve or deploy the user's ERC-4337 smart account.                           |
| `sendTransaction(tx)`      | Send a gasless transaction. Returns `Promise<SponsoredTransactionResult>`.      |

#### Types

```typescript
interface SponsoredTransaction {
  to: Address;
  data?: Hex;
  value?: bigint;
}

interface SponsoredTransactionResult {
  userOpHash: Hash;
  txHash?: Hash;
  success: boolean;
}
```

---

## 🧪 Running a Local Bundler (Alto)

For production use or local testing, you may want to run your own bundler.

1.  **Clone and build Alto**:

    ```bash
    git clone https://github.com/pimlicolabs/alto.git
    cd alto
    pnpm install && pnpm build
    ```

2.  **Create config file** (`config.conflux.json`):

    ```json
    {
      "network-name": "conflux-testnet",
      "rpc-url": "https://evmtestnet.confluxrpc.com",
      "entrypoints": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789,0xYOUR_PAYMASTER",
      "executor-private-keys": "0xYOUR_FUNDED_PRIVATE_KEY",
      "port": 4337
    }
    ```

3.  **Run**:
    ```bash
    ./alto --config ./config.conflux.json
    ```

Then pass `bundlerUrl: 'http://localhost:4337/rpc'` to the SDK.

---

## 🔒 Security Considerations

| Risk                            | Mitigation                                                                                                 |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| **Backend Signer Key Leak**     | Store key in a secrets manager (e.g., AWS KMS, Doppler). Rotate using `setSigner()` on paymaster contract. |
| **Signature Replay**            | SDK includes chainId and paymaster address in signed hash, preventing cross-chain/cross-contract replay.   |
| **Denial of Service**           | Implement rate limiting in your backend (e.g., by user address or IP).                                     |
| **Gas Griefing**                | Paymaster contract includes `maxGasPrice` and `maxVerificationGas` limits.                                 |
| **UserOperation Front-running** | The signature commits to the exact UserOperation fields, preventing modification.                          |

---

## 📁 Project Structure

```
conflux-paymaster/
├── packages/
│   ├── contracts/                    # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── VerifyingPaymaster.sol
│   │   │   ├── SimpleAccount.sol
│   │   │   └── SimpleAccountFactory.sol
│   │   ├── scripts/
│   │   │   ├── deploy.ts             # Deploy to testnet/mainnet
│   │   │   └── deploy-local.ts       # Deploy to local Hardhat
│   │   └── test/
│   │       └── contracts.test.ts
│   │
│   ├── backend/                      # Signing service (Node.js/Express)
│   │   └── src/
│   │       └── index.ts
│   │
│   └── sdk/                          # TypeScript SDK
│       ├── src/
│       │   ├── index.ts              # Main entry point
│       │   ├── client.ts             # Core client class
│       │   └── types.ts              # TypeScript definitions
│       └── examples/
│           └── nextjs/               # Next.js integration example
│
├── package.json                       # Workspace root
├── SPEC.md                            # Technical specification
└── README.md
```

---

## 👥 Team

| Name            | Role                    | GitHub      | Discord       |
| :-------------- | :---------------------- | :---------- | :------------ |
| [Your Name]     | Core Developer          | @yourgithub | yourdiscord   |
| [Teammate Name] | Smart Contract Engineer | @teammate   | teammate#1234 |

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built on the [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) standard.
- Uses [viem](https://viem.sh) for type-safe Ethereum interactions.
- Inspired by the [Pimlico](https://pimlico.io) team's work on account abstraction infrastructure.

---

**Built with ❤️ for the Conflux eSpace Ecosystem**

_Gasless. Simple. Open Source._
