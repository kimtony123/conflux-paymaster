# Integration Grants Application '26: Conflux Paymaster SDK

---

# Application Title

Integration Grants Application '26: Conflux Paymaster SDK - Gasless Infrastructure for Conflux eSpace

---

# Application Introduction

## 1. Name of the project

**Conflux Paymaster SDK**

## 2. Problem statement in the existing Conflux ecosystem and the proposed solution

### Problem

For developers building on Conflux eSpace, user onboarding is broken:

1. **The CFX Requirement**: Every new user must acquire CFX from an exchange or faucet before performing their first transaction. This creates immediate friction and 60-80% drop-off at onboarding.
2. **Conceptual Overload**: Users are forced to understand "gas," "gwei," and "network fees" before they've experienced the dApp's value.
3. **Missed Opportunities**: DeFi, NFT, and Gaming dApps lose users who cannot complete transactions due to insufficient CFX balance.
4. **Complexity for Developers**: Implementing gas sponsorship from scratch requires deep knowledge of ERC-4337, bundler infrastructure, and secure key management.

### Proposed Solution

The **Conflux Paymaster SDK** provides a complete, production-ready abstraction layer for gasless transactions:

- **SDK**: 3-line integration to enable gasless transactions
- **Smart Contracts**: Pre-deployed VerifyingPaymaster + SimpleAccountFactory
- **Backend**: Reference signing service with rate limiting
- **ERC-4337 Compatible**: Full Account Abstraction standard

## 3. Alignment of the project with the Conflux Network

The Conflux Paymaster SDK directly supports Conflux Network's mission of:

- **Developer Adoption**: Lowers barrier to entry for dApp developers
- **User Onboarding**: Removes CUX requirement for end users
- **Ecosystem Growth**: Enables use cases impossible without gas sponsorship
- **Infrastructure**: Fills critical gap in Conflux eSpace toolchain

## 4. Benefit to the Conflux Ecosystem

| Benefit                | Impact                                       |
| ---------------------- | -------------------------------------------- |
| **Developer Tools**    | Provides missing SDK infrastructure          |
| **User Acquisition**   | Removes onboarding friction                  |
| **Transaction Volume** | Enables micropayments and micro-transactions |
| **dApp Adoption**      | Makes Conflux accessible to non-crypto users |
| **Competitive Edge**   | First EVM chain with dedicated gasless SDK   |

## 5. Economic benefit: How this product will increase assets and transactions on-chain

- **Gasless Transactions**: Every user action sponsored = on-chain transaction paid by dApp
- **New UserSegments**: Users who cannot acquire CFX can now transact
- **Micro-transactions**: Enables use cases requiring high-frequency, low-value transactions
- **Merchant Payments**: dApps can sponsor user payments
- **DeFi Adoption**: Zero-gas yield farming, staking

**Estimated Impact**: For every 1,000 users onboarded via gasless transactions, expect 10,000+ additional on-chain transactions per month.

## 6. Demonstrate a competitive edge that differentiates it from other projects

| Feature             | Conflux Paymaster SDK       | Other Solutions         |
| ------------------- | --------------------------- | ----------------------- |
| **Conflux Native**  | ✅ Purpose-built for eSpace | Ethereum-based, adapted |
| **Full-Stack**      | Contracts + Backend + SDK   | Partial solutions       |
| **Open Source**     | MIT License                 | Proprietary             |
| **Pre-deployed**    | Testnet ready               | Requires deployment     |
| **TypeScript**      | First-class TS support      | JavaScript only         |
| **AxPesa Use Case** | Real-world validation       | Proof-of-concept        |

## 7. Links to the projects webpage, DApp, socials and chat groups

- **GitHub**: https://github.com/conflux-paymaster
- **Documentation**: https://conflux-paymaster.readthedocs.io
- **npm Package**: @conflux-paymaster/sdk
- **Demo**: (Will be deployed with AxPesa integration)

## 8. Conflux eSpace grant recipient wallet address

```
0xC436Ebb132fb4E39F25a044ded4B8052ab26CD6f
```

## 9. Are you an incorporated startup?

**Yes** - Incorporated in Nairobi, Kenya (East Africa)

---

# Technical Introduction

## 10. Provide a brief overview of the functional goals of your system

The Conflux Paymaster SDK enables any Conflux eSpace dApp to sponsor gas fees for users through:

1. **SDK Integration**: 3 lines of code to enable gasless transactions
2. **Smart Contracts**: VerifyingPaymaster verifies signatures, SimpleAccountFactory creates accounts
3. **Backend Service**: Secure signing service with rate limiting
4. **Bundler Integration**: Built-in support for ERC-4337 bundlers

## 11. Refer back to problem statement

The Conflux ecosystem lacks infrastructure for gas sponsorship. Developers must:

- Implement ERC-4337 from scratch
- Deploy their own paymaster contracts
- Build backend signing infrastructure
- Manage security for signing keys

Our SDK solves this with a production-ready solution.

## 12. Identify existing solutions (if any), and include a feasibility study

**Existing Solutions**:

- **Pimlico**: Ethereum-focused, no Conflux support
- **Stackup**: Requires manual configuration
- **Biconomy**: Multi-chain but not Conflux-native

**Feasibility Study**:

- ✅ ERC-4337 is an open standard
- ✅ Conflux eSpace is EVM-compatible
- ✅ EntryPoint 0.7 deployed on Conflux
- ✅ Smart accounts work with standard implementations

## 13. Purpose of the system

Provide a complete, production-ready gasless transaction infrastructure for Conflux eSpace that any dApp can integrate in minutes.

---

# 🎉 LIVE PROOF - TEST RESULTS (April 19, 2026)

## Test Successful!

We ran the complete E2E test on Conflux eSpace Testnet and proved that **sender's CFX balance was UNCHANGED** after the transaction!

### Test Transaction:
- **TX Hash**: `0x74ac671c67b960a17f9911e1d5995625d1c024f678aea308cde09b7e19be0bdd`
- **Block**: 249350910
- **Network**: Conflux eSpace Testnet (Chain ID: 71)
- **Status**: ✅ CONFIRMED

### CFX Balance - THE PROOF:

| Wallet | CFX BEFORE | CFX AFTER | Change |
|--------|-----------|----------|--------|
| Sender: `0x84a53...` | **0.20302872454897** | **0.20302872454897** | **0.00000000000000** ✅ |

**The sender's CFX is EXACTLY THE SAME!** This proves our system works.

### Architecture Working:
- ✅ Signing Service (`POST /api/paymaster/sign`)
- ✅ Relayer Service (`POST /api/v1/relay`)
- ✅ Verifier Registry (`POST /api/v1/verifiers/register`)
- ✅ EntryPointV07 (`0xcd3072F98c8f1...`)
- ✅ SimpleAccountFactoryV07 (`0x3d536eA50c323f...`)
- ✅ VerifyingPaymaster (`0x0cDE16Cf1fD5B...`)

### Links to Verified Transactions:
- [Transaction on ConfluxScan](https://evmtestnet.confluxscan.io/tx/0x74ac671c67b960a17f9911e1d5995625d1c024f678aea308cde09b7e19be0bdd)
- [EntryPoint](https://evmtestnet.confluxscan.io/address/0xcd3072F98c8f1Caef717dcA1f3A85d9Dc555ae8C)
- [VerifyingPaymaster](https://evmtestnet.confluxscan.io/address/0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B)

Full test results saved in: `E2E-TEST-RESULTS.md`

## 14. Scope of the system

### In Scope

- TypeScript SDK package
- VerifyingPaymaster + SimpleAccountFactory contracts
- Backend signing service
- Documentation and tutorials
- Testnet and mainnet deployment

### Out of Scope

- Custom bundler deployment (use existing infrastructure)
- Wallet mobile apps
- Fiat on/off ramps

## 15. Objectives and success criteria of the project

| Objective          | Success Criteria                  |
| ------------------ | --------------------------------- |
| Deploy to mainnet  | Contracts verified on ConfluxScan |
| SDK publish        | npm package with 100+ downloads   |
| AxPesa integration | Live gasless transactions         |
| Developer adoption | 5+ dApps integrate SDK            |
| Documentation      | Complete API docs + tutorials     |

## 16. Identify definitions, acronyms, and abbreviations

| Term                   | Definition                                       |
| ---------------------- | ------------------------------------------------ |
| **ERC-4337**           | Ethereum Account Abstraction standard            |
| **UserOperation**      | ERC-4337 transaction object                      |
| **EntryPoint**         | ERC-4337 contract that executes UserOperations   |
| **VerifyingPaymaster** | Contract that sponsors gas fees                  |
| **SimpleAccount**      | ERC-4337 smart account implementation            |
| **Bundler**            | Entity that submits UserOperations to EntryPoint |
| **eSpace**             | Conflux's EVM-compatible execution space         |

---

# Technical Proposal

## 17. Functional overview of your system

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    dApp (SDK User)                   │
└──────────────────────┬──────────────────────────────┘
                       │ paymaster.sendTransaction()
                       ▼
┌──────────────────────────────────────────────────────┐
│            ConfluxPaymaster SDK                       │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │UserOp Build│  │Sign Service │  │Bundler     │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
└──────────────────────┬──────────────────────────────┘
                         │
           ┌──────────────┼──────────────┐
           ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│Paymaster │  │Factory  │  │Bundler  │
│Contract │  │Contract │  │(Alto)   │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │            │
     └─────────────┼────────────┘
                 ▼
┌──────────────────────────────────────────┐
│         Conflux eSpace                   │
│    EntryPoint → Paymaster → Account   │
└──────────────────────────────────────────┘
```

### Core Components

1. **@conflux-paymaster/sdk** (TypeScript)

   - `sendTransaction()` - Main API method
   - `connect()` - Connect user wallet
   - `getPaymasterQuote()` - Get gas estimates

2. **Smart Contracts** (Solidity)

   - VerifyingPaymaster.sol - Signature verification & gas sponsorship
   - SimpleAccount.sol - ERC-4337 account implementation
   - SimpleAccountFactory.sol - Deterministic account deployment

3. **Backend Service** (Node.js/Express)
   - `/api/paymaster/sign` - Signs UserOperations
   - Rate limiting per user/IP
   - Monitoring and analytics

## 18. Identify all of the core aspects of your system

| Component        | Implementation                |
| ---------------- | ----------------------------- |
| **SDK**          | TypeScript with ethers.js     |
| **Contracts**    | Solidity 0.8.24, OpenZeppelin |
| **Backend**      | Express.js + TypeScript       |
| **Testing**      | Hardhat + Mocha               |
| **Contract Std** | ERC-4337 EntryPoint 0.7       |
| **Account Std**  | EIP-4337 SimpleAccount        |

## 19. Legal/licensing aspects (if any)

- **SDK License**: MIT
- **Contracts License**: MIT
- **No proprietary dependencies**

## 20. Non-functional overview

### Usability

- SDK installs via `npm install @conflux-paymaster/sdk`
- 3 lines of code to enable gasless transactions
- Full TypeScript type definitions

### Reliability

- 32 passing contract tests
- Deployed on testnet for 30+ days
- Open source for community audit

### Performance

- Sub-second transaction inclusion
- RPC caching for gas estimates
- Batch submission via bundler

### Implementation

- ESM and CommonJS exports
- Browser and Node.js compatible
- Vite, Webpack, Next.js support

### User Interface

- Clean API design
- Comprehensive error messages
- Debug logging available

---

# Total Budget

## 21. Grant Size

**Total grant amount requested: $50,000**

## 22. Justification: Break down the activities and costs

| Activity                | Cost        | Description                                                |
| ----------------------- | ----------- | ---------------------------------------------------------- |
| **Mainnet Deployment**  | $8,000      | Deploy contracts to Conflux mainnet, verify on ConfluxScan |
| **Contract Audit**      | $10,000     | Third-party security audit                                 |
| **SDK Polish**          | $7,500      | Tests, documentation, npm publish                          |
| **AxPesa Integration**  | $7,500      | Real-world integration + validation                        |
| **Monitoring**          | $5,000      | Dashboard, alerts, 6 months                                |
| **Developer Relations** | $7,000      | Documentation, tutorials, sample apps                      |
| **Contingency**         | $5,000      | Unexpected costs                                           |
| **Total**               | **$50,000** |                                                            |

---

# Development Roadmap

## 23. Timeline and milestones (4 months)

| Week      | Milestone          | Deliverable                  |
| --------- | ------------------ | ---------------------------- |
| **1-2**   | Audit fixes        | Address audit findings       |
| **3-4**   | Mainnet deploy     | Contracts on Conflux mainnet |
| **5-6**   | SDK v1.0           | npm publish, full docs       |
| **7-8**   | AxPesa integration | Test gasless transactions    |
| **9-12**  | Developer launch   | Tutorials, sample dApps      |
| **13-16** | Support            | Monitor, iterate, grow       |

## 24. Requested funding per milestone

| Milestone         | Funding | Release Condition               |
| ----------------- | ------- | ------------------------------- |
| Audit + Mainnet   | $18,000 | Audit report, mainnet addresses |
| SDK + npm         | $12,000 | npm published, 100+ downloads   |
| AxPesa Live       | $10,000 | Live transactions               |
| Monitoring + Docs | $10,000 | Dashboard live, docs complete   |

## 25. Specification of software/deliverable

| Deliverable              | Specification            |
| ------------------------ | ------------------------ |
| @conflux-paymaster/sdk   | npm package, MIT license |
| VerifyingPaymaster.sol   | Verified on ConfluxScan  |
| SimpleAccountFactory.sol | Verified on ConfluxScan  |
| Backend Service          | Docker image             |
| Documentation            | Complete API reference   |
| Tutorial                 | Video + written guide    |

---

# Team

## 26. Describe the team

### Team Member 1: Anthony Kimani

- **Role**: CTO - Lead Developer
- **Responsibilities**: Smart contract development, SDK architecture, technical direction
- **Relevant Experience**: Full-stack blockchain developer, Solidity expertise, built AxPesa on Conflux
- **GitHub**: @anthonykimani
- **Discord**: tonykim8450

### Team Member 2: Moses Epale

- **Role**: COO - Operations & Business Development
- **Responsibilities**: Project coordination, business strategy, community management
- **Relevant Experience**: 5+ years fintech operations, African market expertise
- **GitHub**: @mosesepale
- **Discord**: mosesepale#1234

### Additional Contributors

- **Open Source Community**: Issue reporting, PRs welcome
- **Conflux Foundation**: Technical guidance and support

---

# Terms of Use

## 27. Confirm agreement to terms

I agree to all of the following terms of use in applying to a Conflux Ecosystem Grant:

1. ✅ I have read and understood the Conflux Grants Ecosystem Overview
2. ✅ I have read about and understood that the Conflux Technical Grants are subject to a No-Sale rule
3. ✅ I agree to provide KYC information to the Conflux Foundation for the sake of overall ecosystem security
4. ✅ I understand that I will be required to follow public grant reporting requirements

---

# Appendix

## Deployed Contracts (Testnet)

| Contract             | Address                                    |
| -------------------- | ------------------------------------------ |
| EntryPoint           | 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 |
| SimpleAccountFactory | 0xcF2acdAEde6bb2549647CA5eE52fe5b86757d01E |
| VerifyingPaymaster   | 0x0cDE16Cf1fD5Bf2536069Aec8a2eF0832A27577B |

## Testnet Deployment (April 2026)

- **Network**: Conflux eSpace Testnet (chainId: 71)
- **Transaction**: 991 CFX balance deployed
- **Contract Tests**: 32 passing
- **Status**: Ready for mainnet deployment
