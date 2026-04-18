# Conflux Paymaster SDK Specification

## Overview

**Conflux Paymaster SDK** enables gasless transactions on Conflux eSpace through ERC-4337 Account Abstraction.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   dApp (AxPesa) │ ──── │  SDK (@conflux- │ ──── │  Signing Service│
│                 │      │    paymaster)   │      │   (Backend)     │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │    Bundler      │              │
         │              │   (Alto/etc)    │              │
         │              └────────┬────────┘              │
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────────────────────────┐
         │              │         CONFLUX eSPACE               │
         │              │  ┌─────────┐  ┌─────────────────┐   │
         │              │  │ Entry   │  │  Verifying      │   │
         │              │  │ Point   │  │  Paymaster      │   │
         │              │  └────┬────┘  └─────────────────┘   │
         │              │       │                            │
         │              │       ▼                            │
         │              │  ┌─────────────────┐                │
         │              │  │  SimpleAccount │                │
         │              │  │    Factory     │                │
         │              │  └─────────────────┘                │
         └──────────────┴─────────────────────────────────────┘
```

## Package Structure

```
conflux-paymaster/
├── packages/
│   ├── contracts/           # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── VerifyingPaymaster.sol
│   │   │   ├── SimpleAccount.sol
│   │   │   └── SimpleAccountFactory.sol
│   │   ├── scripts/
│   │   │   ├── deploy.ts
│   │   │   └── deploy-local.ts
│   │   └── test/
│   │       └── contracts.test.ts
│   │
│   ├── backend/             # Signing service
│   │   └── src/
│   │       └── index.ts
│   │
│   └── sdk/                 # TypeScript SDK
│       ├── src/
│       │   ├── index.ts
│       │   ├── client.ts
│       │   └── types.ts
│       └── examples/
│           └── nextjs/
│
├── package.json             # Workspace root
└── README.md
```

## Configuration

### Smart Contracts

| Contract | Address (Testnet) | Address (Mainnet) |
|----------|-------------------|-------------------|
| EntryPoint | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| VerifyingPaymaster | Deploy after running scripts | Deploy after running scripts |
| SimpleAccountFactory | Deploy after running scripts | Deploy after running scripts |

### Environment Variables

#### Contracts (`packages/contracts/.env`)
```
DEPLOYER_PRIVATE_KEY=0x...
CONFLUX_TESTNET_RPC=https://evmtestnet.confluxrpc.com
CONFLUX_MAINNET_RPC=https://evm.confluxrpc.com
CONFLUXSCAN_API_KEY=...
```

#### Backend (`packages/backend/.env`)
```
PAYMASTER_ADDRESS=0x...
SIGNER_PRIVATE_KEY=0x...
CONFLUX_RPC_URL=https://evmtestnet.confluxrpc.com
CHAIN_ID=71
DAILY_TX_LIMIT=100
```

#### SDK/Frontend
```
NEXT_PUBLIC_CONFLUX_RPC_URL=https://evmtestnet.confluxrpc.com
NEXT_PUBLIC_PAYMASTER_ADDRESS=0x...
NEXT_PUBLIC_SIGNING_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
```

## Deployment Steps

### 1. Deploy Contracts
```bash
cd packages/contracts
cp .env.example .env
# Edit .env with your private key
npm run deploy:testnet
```

### 2. Fund Paymaster
Send CFX to the deployed VerifyingPaymaster address to sponsor user transactions.

### 3. Start Backend
```bash
cd packages/backend
cp .env.example .env
# Edit .env with your paymaster address and signer key
npm run dev
```

### 4. Build SDK
```bash
cd packages/sdk
npm run build
```

### 5. Integrate
```typescript
import { ConfluxPaymaster } from '@conflux-paymaster/sdk';

const paymaster = new ConfluxPaymaster({
  rpcUrl: 'https://evmtestnet.confluxrpc.com',
  paymasterAddress: '0x...',
  signingServiceUrl: 'https://your-backend.com',
  chainId: 71,
});

paymaster.connect(privateKey);
const result = await paymaster.sendTransaction({
  to: tokenAddress,
  data: encodedData,
});
```

## API Reference

### ConfluxPaymaster

```typescript
class ConfluxPaymaster {
  constructor(config: PaymasterConfig)
  connect(privateKey: string): void
  setFactory(factoryAddress: string): void
  getSmartAccountAddress(owner: string, salt?: bigint): Promise<string>
  getOrCreateAccount(config?: SmartAccountConfig): Promise<string>
  sendTransaction(tx: SponsoredTransaction): Promise<SponsoredTransactionResult>
  getPaymasterQuote(): Promise<PaymasterQuote>
}
```

### Types

```typescript
interface PaymasterConfig {
  rpcUrl: string;
  paymasterAddress: string;
  signingServiceUrl: string;
  chainId: 71 | 1030;
  bundlerUrl?: string;
  entryPointAddress?: string;
}

interface SponsoredTransaction {
  to: string;
  data?: string;
  value?: bigint;
}

interface SponsoredTransactionResult {
  userOpHash: string;
  txHash?: string;
  success: boolean;
}
```

## Security Considerations

- [ ] Store signing keys securely (AWS KMS, HashiCorp Vault)
- [ ] Implement rate limiting per user/IP
- [ ] Add request validation and sanitization
- [ ] Monitor paymaster balance
- [ ] Set up alerting for failed transactions
- [ ] Regular key rotation

## Roadmap

- [ ] Deploy to Conflux eSpace Testnet
- [ ] Deploy to Conflux eSpace Mainnet
- [ ] Integration with AxPesa
- [ ] Support for EIP-7702 (native account abstraction)
- [ ] Multi-chain support
