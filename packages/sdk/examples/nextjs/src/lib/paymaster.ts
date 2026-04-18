import { ConfluxPaymaster, PaymasterConfig } from "@conflux-paymaster/sdk";

const config: PaymasterConfig = {
  rpcUrl: process.env.NEXT_PUBLIC_CONFLUX_RPC_URL!,
  paymasterAddress: process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS!,
  signingServiceUrl: process.env.NEXT_PUBLIC_SIGNING_SERVICE_URL!,
  chainId: parseInt(process.env.NEXT_PUBLIC_CONFLUX_CHAIN_ID || "71") as 71 | 1030,
  bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL,
  entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
};

let paymasterInstance: ConfluxPaymaster | null = null;

export function getPaymaster(): ConfluxPaymaster {
  if (!paymasterInstance) {
    paymasterInstance = new ConfluxPaymaster(config);
    paymasterInstance.setFactory(process.env.NEXT_PUBLIC_FACTORY_ADDRESS!);
  }
  return paymasterInstance;
}

export function initializePaymaster(privateKey: string): ConfluxPaymaster {
  const paymaster = getPaymaster();
  paymaster.connect(privateKey);
  return paymaster;
}
