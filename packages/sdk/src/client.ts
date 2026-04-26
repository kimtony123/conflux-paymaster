import { ethers, Network } from "ethers";
import {
  PaymasterConfig,
  SponsoredTransaction,
  SponsoredTransactionResult,
  SmartAccountConfig,
  UserOperation,
  PaymasterQuote,
  PaymasterSignResponse,
  ENTRY_POINT_ADDRESS,
  WalletSigner,
} from "./types.js";

export class ConfluxPaymaster {
  private rpcUrl: string;
  private paymasterAddress: string;
  private signingServiceUrl: string;
  private chainId: number;
  private entryPointAddress: string;
  private apiKey?: string;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private walletSigner?: WalletSigner;
  private factoryAddress?: string;
  
  private cachedGasPrice?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; timestamp: number };
  private readonly GAS_CACHE_TTL = 15000;

  constructor(config: PaymasterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.paymasterAddress = config.paymasterAddress;
    this.signingServiceUrl = config.signingServiceUrl;
    this.chainId = config.chainId;
    this.entryPointAddress = config.entryPointAddress || ENTRY_POINT_ADDRESS;
    this.apiKey = config.apiKey;
    
    const network = new Network(config.chainId === 71 ? 'conflux-testnet' : 'conflux', config.chainId);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, network, { staticNetwork: true });
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  async connect(privateKey: string): Promise<void> {
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  async connectWallet(wallet: WalletSigner): Promise<void> {
    this.walletSigner = wallet;
  }

  getAddress(): string {
    if (this.walletSigner) {
      return this.walletSigner.address;
    }
    if (this.signer) {
      return this.signer.address;
    }
    throw new Error("No wallet connected. Call connect() or connectWallet() first.");
  }

  getSenderAddress(): string {
    return this.getAddress();
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

  async getOrCreateAccount(config?: SmartAccountConfig): Promise<{ accountAddress: string; initCode: string }> {
    if (!this.signer && !this.walletSigner) {
      throw new Error("Call connect() or connectWallet() first");
    }

    const owner = config?.owner || this.getAddress();
    const salt = config?.index || 0n;

    const accountAddress = await this.getSmartAccountAddress(owner, salt);
    const code = await this.provider.getCode(accountAddress);

    if (code && code !== "0x") {
      return { accountAddress, initCode: "0x" };
    }

    if (!this.factoryAddress) {
      throw new Error("Factory address not set. Call setFactory() first.");
    }
    
    const factoryIface = new ethers.Interface([
      "function createAccount(address owner, uint256 salt) returns (address)"
    ]);
    const initData = factoryIface.encodeFunctionData("createAccount", [owner, salt]);
    const factoryBytes = ethers.getBytes(this.factoryAddress as string);
    const initCode = ethers.hexlify(ethers.concat([factoryBytes, initData]));

    return { accountAddress, initCode };
  }

  async getGasPrice(forceRefresh = false): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const now = Date.now();
    
    if (!forceRefresh && this.cachedGasPrice && (now - this.cachedGasPrice.timestamp) < this.GAS_CACHE_TTL) {
      return {
        maxFeePerGas: this.cachedGasPrice.maxFeePerGas,
        maxPriorityFeePerGas: this.cachedGasPrice.maxPriorityFeePerGas,
      };
    }
    
    const feeData = await this.provider.getFeeData();
    
    this.cachedGasPrice = {
      maxFeePerGas: feeData.maxFeePerGas || 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1000000000n,
      timestamp: now,
    };
    
    return {
      maxFeePerGas: this.cachedGasPrice.maxFeePerGas,
      maxPriorityFeePerGas: this.cachedGasPrice.maxPriorityFeePerGas,
    };
  }

  private async buildUserOperation(
    sender: string,
    initCode: string,
    to: string,
    data: string,
    value: bigint
  ): Promise<UserOperation> {
    const [nonce, gasPrice] = await Promise.all([
      this.getNonce(sender),
      this.getGasPrice(),
    ]);

    const callData = this.encodeExecuteCall(to, value, data);

    return {
      sender,
      nonce,
      initCode: initCode || "0x",
      callData,
      callGasLimit: 1500000n,
      verificationGasLimit: 200000n,
      preVerificationGas: 50000n,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      paymasterAndData: "0x",
      signature: "0x",
    };
  }
  
  private async getNonce(sender: string): Promise<bigint> {
    const entryPoint = new ethers.Contract(
      this.entryPointAddress,
      ["function getNonce(address sender, uint192 key) view returns (uint256 nonce)"],
      this.provider
    );
    
    try {
      return await entryPoint.getNonce(sender, 0n) as bigint;
    } catch {
      return 0n;
    }
  }

  private encodeExecuteCall(target: string, value: bigint, data: string): string {
    const iface = new ethers.Interface([
      "function execute(address target, uint256 value, bytes data)"
    ]);
    return iface.encodeFunctionData("execute", [target, value, data]);
  }

  private async fetchPaymasterSignature(userOp: UserOperation): Promise<string> {
    const response = await fetch(`${this.signingServiceUrl}/api/paymaster/sign`, {
      method: "POST",
      headers: this.getHeaders(),
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

  private async signUserOperation(userOp: UserOperation): Promise<string> {
    if (!this.signer && !this.walletSigner) {
      throw new Error("Call connect() or connectWallet() first");
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

    let signature: string;
    if (this.walletSigner) {
      signature = await this.walletSigner.signMessage(ethers.getBytes(finalHash));
    } else {
      signature = await this.signer!.signMessage(ethers.getBytes(finalHash));
    }
    return signature;
  }

  async sendTransaction(tx: SponsoredTransaction): Promise<SponsoredTransactionResult> {
    if (!this.signer && !this.walletSigner) {
      throw new Error("Call connect() or connectWallet() first");
    }

    const { accountAddress, initCode } = await this.getOrCreateAccount();

    let userOp = await this.buildUserOperation(
      accountAddress,
      initCode,
      tx.to,
      tx.data || "0x",
      tx.value || 0n
    );

    const paymasterAndData = await this.fetchPaymasterSignature(userOp);
    userOp.paymasterAndData = paymasterAndData;

    const signature = await this.signUserOperation(userOp);
    userOp.signature = signature;

    const response = await fetch(`${this.signingServiceUrl}/api/v1/relay`, {
      method: "POST",
      headers: this.getHeaders(),
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
        userAddress: accountAddress,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Relayer failed: ${error}`);
    }

    const result = await response.json() as {
      success: boolean;
      userOpHash: string;
      transactionHash: string;
    };

    return {
      userOpHash: result.userOpHash,
      txHash: result.transactionHash,
      success: result.success,
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
      entryPointAddress: this.entryPointAddress,
      apiKey: this.apiKey,
    };
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }
}

export default ConfluxPaymaster;