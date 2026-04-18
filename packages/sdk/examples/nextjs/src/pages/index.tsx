import { useState, useCallback } from "react";
import { initializePaymaster } from "@/lib/paymaster";
import { ethers } from "ethers";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

export default function Home() {
  const [privateKey, setPrivateKey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSend = useCallback(async () => {
    if (!privateKey || !recipient || !amount) {
      setStatus("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setStatus("Sending gasless transaction...");
    setResult(null);

    try {
      const paymaster = initializePaymaster(privateKey);

      const iface = new ethers.Interface(ERC20_ABI);
      const data = iface.encodeFunctionData("transfer", [
        recipient,
        ethers.parseUnits(amount, 18),
      ]);

      const txResult = await paymaster.sendTransaction({
        to: tokenAddress || recipient,
        data,
        value: 0n,
      });

      setResult(txResult);
      setStatus(`Success! UserOp Hash: ${txResult.userOpHash}`);
    } catch (error: any) {
      console.error("Transaction failed:", error);
      setStatus(`Error: ${error.message || "Transaction failed"}`);
    } finally {
      setIsLoading(false);
    }
  }, [privateKey, recipient, amount, tokenAddress]);

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">
        Conflux Paymaster SDK Demo
      </h1>
      <p className="text-gray-600 mb-8">
        Send gasless transactions on Conflux eSpace using the @conflux-paymaster/sdk
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Wallet Private Key
          </label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="0x..."
            className="w-full p-3 border rounded-lg font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            This key controls your smart account
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full p-3 border rounded-lg font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Token Address (optional - leave empty for native CFX)
          </label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x... (ERC-20 token)"
            className="w-full p-3 border rounded-lg font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Amount
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.0"
            className="w-full p-3 border rounded-lg"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isLoading}
          className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium disabled:bg-gray-400"
        >
          {isLoading ? "Sending..." : "Send Gasless Transaction"}
        </button>

        {status && (
          <div className={`p-4 rounded-lg ${result ? "bg-green-50" : "bg-gray-50"}`}>
            <p className="font-medium">{status}</p>
            {result && (
              <div className="mt-4 text-sm">
                <p>UserOp Hash: {result.userOpHash}</p>
                {result.txHash && <p>Tx Hash: {result.txHash}</p>}
                <p>Success: {result.success ? "Yes" : "No"}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Your private key is used to control a smart account</li>
          <li>The SDK builds a UserOperation for the ERC-4337 EntryPoint</li>
          <li>The paymaster backend signs to sponsor your gas fees</li>
          <li>The bundler includes your transaction on-chain</li>
          <li>You pay zero gas!</li>
        </ol>
      </div>
    </main>
  );
}
