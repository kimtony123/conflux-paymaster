import { ethers } from "ethers";
import {
  PaymasterConfig,
  SponsoredTransaction,
  SponsoredTransactionResult,
  SmartAccountConfig,
  UserOperation,
  PaymasterQuote,
  PaymasterSignResponse,
  UserOpReceipt,
  ENTRY_POINT_ADDRESS,
  DEFAULT_BUNDLER_URLS,
} from "./types.js";

export class ConfluxPaymaster {
  private rpcUrl: string;
  private paymasterAddress: string;
  private signingServiceUrl: string;
  private chainId: number;
  private bundlerUrl: string;
  private entryPointAddress: string;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private factoryAddress?: string;

  constructor(config: PaymasterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.paymasterAddress = config.paymasterAddress;
    this.signingServiceUrl = config.signingServiceUrl;
    this.chainId = config.chainId;
    this.bundlerUrl = config.bundlerUrl || this.getDefaultBundlerUrl();
    this.entryPointAddress = config.entryPointAddress || ENTRY_POINT_ADDRESS;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  private getDefaultBundlerUrl(): string {
    return this.chainId === 71 
      ? DEFAULT_BUNDLER_URLS.testnet 
      : DEFAULT_BUNDLER_URLS.mainnet;
  }

  async connect(privateKey: string): Promise<void> {
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  async setFactory(factoryAddress: string): Promise<void> {
    this.factoryAddress = factoryAddress;
  }

  async getSmartAccountAddress(owner: string, salt: bigint = 0n): Promise<string> {
    if (!this.factoryAddress) {
      throw new Error("Factory address not set. Call setFactory() first.");
    }

    const iface = new ethers.Interface([
      "function getAddress(address owner, uint256 salt) view returns (address)"
    ]);
    
    const calldata = iface.encodeFunctionData("getAddress", [owner, salt]);
    const result = await this.provider.call({
      to: this.factoryAddress,
      data: calldata,
    });
    
    return iface.decodeFunctionResult("getAddress", result)[0] as string;
  }

  async getOrCreateAccount(config?: SmartAccountConfig): Promise<string> {
    if (!this.signer) {
      throw new Error("Call connect() first with a private key");
    }

    const owner = config?.owner || this.signer.address;
    const salt = config?.index || 0n;

    const accountAddress = await this.getSmartAccountAddress(owner, salt);
    const code = await this.provider.getCode(accountAddress);

    if (code && code !== "0x") {
      return accountAddress;
    }

    throw new Error(
      `Account not deployed at ${accountAddress}. Please fund this address with CFX for deployment.`
    );
  }

  async getGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const feeData = await this.provider.getFeeData();
    
    return {
      maxFeePerGas: feeData.maxFeePerGas || 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1000000000n,
    };
  }

  async buildUserOperation(
    sender: string,
    to: string,
    data: string,
    value: bigint
  ): Promise<UserOperation> {
    const entryPoint = new ethers.Contract(
      this.entryPointAddress,
      [
        "function getNonce(address sender, uint192 key) view returns (uint256 nonce)"
      ],
      this.provider
    );

    let nonce: bigint;
    try {
      nonce = await entryPoint.getNonce(sender, 0n) as bigint;
    } catch {
      nonce = 0n;
    }

    const gasPrice = await this.getGasPrice();

    const callData = this.encodeExecuteCall(to, value, data);

    return {
      sender,
      nonce,
      initCode: "0x",
      callData,
      callGasLimit: 200000n,
      verificationGasLimit: 200000n,
      preVerificationGas: 50000n,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      paymasterAndData: "0x",
      signature: "0x",
    };
  }

  private encodeExecuteCall(target: string, value: bigint, data: string): string {
    const iface = new ethers.Interface([
      "function execute(address target, uint256 value, bytes data)"
    ]);
    return iface.encodeFunctionData("execute", [target, value, data]);
  }

  async fetchPaymasterSignature(userOp: UserOperation): Promise<string> {
    const response = await fetch(`${this.signingServiceUrl}/api/paymaster/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userOperation: {
          sender: userOp.sender,
          nonce: userOp.nonce.toString(),
          initCode: userOp.initCode,
          callData: userOp.callData,
          callGasLimit: userOp.callGasLimit.toString(),
          verificationGasLimit: userOp.verificationGasLimit.toString(),
          preVerificationGas: userOp.preVerificationGas.toString(),
          maxFeePerGas: userOp.maxFeePerGas.toString(),
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
          paymasterAndData: userOp.paymasterAndData,
          signature: userOp.signature,
        },
        userAddress: userOp.sender,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Paymaster signing failed: ${error}`);
    }

    const data = (await response.json()) as PaymasterSignResponse;
    return data.paymasterAndData;
  }

  async signUserOperation(userOp: UserOperation): Promise<string> {
    if (!this.signer) {
      throw new Error("Call connect() first with a private key");
    }

    const packed = ethers.solidityPacked(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.initCode || "0x"),
        ethers.keccak256(userOp.callData || "0x"),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        ethers.keccak256(userOp.paymasterAndData || "0x"),
      ]
    );

    const userOpHash = ethers.keccak256(packed);
    const finalHash = ethers.keccak256(
      ethers.concat([
        userOpHash,
        ethers.toBeHex(this.chainId, 32)
      ])
    );

    const signature = await this.signer.signMessage(ethers.getBytes(finalHash));
    return signature;
  }

  async sendToBundler(userOp: UserOperation): Promise<string> {
    const response = await fetch(this.bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, this.entryPointAddress],
      }),
    });

    const data = (await response.json()) as {
      result?: string;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`Bundler error: ${data.error.message}`);
    }

    return data.result!;
  }

  async getUserOperationReceipt(userOpHash: string): Promise<UserOpReceipt | null> {
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

    const data = (await response.json()) as { result?: UserOpReceipt };
    return data.result || null;
  }

  async waitForUserOperationReceipt(
    userOpHash: string,
    timeout: number = 60000
  ): Promise<UserOpReceipt> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const receipt = await this.getUserOperationReceipt(userOpHash);
      if (receipt) {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    
    throw new Error("Timeout waiting for UserOperation receipt");
  }

  async sendTransaction(tx: SponsoredTransaction): Promise<SponsoredTransactionResult> {
    if (!this.signer) {
      throw new Error("Call connect() first with a private key");
    }

    const accountAddress = await this.getOrCreateAccount();

    let userOp = await this.buildUserOperation(
      accountAddress,
      tx.to,
      tx.data || "0x",
      tx.value || 0n
    );

    const paymasterAndData = await this.fetchPaymasterSignature(userOp);
    userOp.paymasterAndData = paymasterAndData;

    const signature = await this.signUserOperation(userOp);
    userOp.signature = signature;

    const userOpHash = await this.sendToBundler(userOp);

    let receipt: UserOpReceipt | null = null;
    try {
      receipt = await this.waitForUserOperationReceipt(userOpHash);
    } catch (error) {
      console.warn("Could not wait for receipt:", error);
    }

    return {
      userOpHash,
      txHash: receipt?.txHash,
      success: receipt?.success ?? true,
    };
  }

  async getPaymasterQuote(): Promise<PaymasterQuote> {
    const response = await fetch(`${this.signingServiceUrl}/api/paymaster/quote`);
    
    if (!response.ok) {
      throw new Error("Failed to get paymaster quote");
    }
    
    return (response.json()) as Promise<PaymasterQuote>;
  }

  getConfig(): PaymasterConfig {
    return {
      rpcUrl: this.rpcUrl,
      paymasterAddress: this.paymasterAddress,
      signingServiceUrl: this.signingServiceUrl,
      chainId: this.chainId as 71 | 1030,
      bundlerUrl: this.bundlerUrl,
      entryPointAddress: this.entryPointAddress,
    };
  }
}

export default ConfluxPaymaster;