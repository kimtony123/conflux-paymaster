import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import "solidity-coverage";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const CONFLUX_TESTNET_RPC = process.env.CONFLUX_TESTNET_RPC || "https://evmtestnet.confluxrpc.com";
const CONFLUX_MAINNET_RPC = process.env.CONFLUX_MAINNET_RPC || "https://evm.confluxrpc.com";
const CONFLUXSCAN_API_KEY = process.env.CONFLUXSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    confluxTestnet: {
      url: CONFLUX_TESTNET_RPC,
      chainId: 71,
      accounts: [PRIVATE_KEY],
    },
    confluxMainnet: {
      url: CONFLUX_MAINNET_RPC,
      chainId: 1030,
      accounts: [PRIVATE_KEY],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      confluxTestnet: CONFLUXSCAN_API_KEY,
      confluxMainnet: CONFLUXSCAN_API_KEY,
    },
    customChains: [
      {
        network: "confluxTestnet",
        chainId: 71,
        urls: {
          apiURL: "https://api.testnet.confluxscan.io/api",
          browserURL: "https://evmtestnet.confluxscan.io",
        },
      },
      {
        network: "confluxMainnet",
        chainId: 1030,
        urls: {
          apiURL: "https://api.confluxscan.io/api",
          browserURL: "https://evm.confluxscan.io",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
