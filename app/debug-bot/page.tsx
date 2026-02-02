"use client";

import { useState } from "react";

export default function DebugBotPage() {
  const [botAddress, setBotAddress] = useState(""); 
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // Alamat token target
  const TARGET_TOKEN = "0x8984B389cB82e05016DB2E4c7230ca0791b9Cb07";

  const handleProcess = async (endpoint: string, body: Record<string, any>) => {
    setLoading(true);
    setStatus(`Executing ${endpoint}...`);
    
    try {
      const res = await fetch(`/api/debug/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setStatus(`✅ Success! Hash: ${data.txHash || 'N/A'}`);
        console.log("Success Response:", data);
      } else {
        setStatus(`❌ Error: ${data.error || 'Unknown error'}`);
        console.error("Backend Error Details:", data);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      setStatus(`🚨 Request failed: ${errorMessage}`);
      console.error("Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLiquidation = () => {
    handleProcess("swap-flow", { botAddress });
  };

  const handleWrapSend = () => {
    handleProcess("wrap-send", { botAddress, recipient });
  };

  return (
    <div className="max-w-2xl mx-auto p-10 space-y-8 bg-gray-50 text-black min-h-screen">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
        <h1 className="text-2xl font-bold border-b pb-4 text-gray-800">
          CDP Bot Debugger <span className="text-sm font-normal text-gray-500">v2.0 (Gasless Flow)</span>
        </h1>

        {/* Step 1: Wallet Address */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">Step 1: Bot Smart Account</label>
          <input
            placeholder="0x... (Smart Account Address)"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={botAddress}
            onChange={(e) => setBotAddress(e.target.value)}
          />
          <p className="text-[10px] text-gray-400 italic">Target Token: {TARGET_TOKEN}</p>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Action A */}
          <div className="p-5 border rounded-xl bg-blue-50/50 border-blue-100 space-y-4">
            <h3 className="font-bold text-blue-800 italic text-sm">A. Liquidate Token</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              1. Unwrap sisa WETH (Gasless)<br/>
              2. Swap $BUMP ke WETH (Gasless via 0x V2)
            </p>
            <button
              onClick={handleLiquidation}
              disabled={loading || !botAddress}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? "Processing..." : "Run Liquidation"}
            </button>
          </div>

          {/* Action B */}
          <div className="p-5 border rounded-xl bg-green-50/50 border-green-100 space-y-4">
            <h3 className="font-bold text-green-800 italic text-sm">B. Exit Strategy</h3>
            <input
              placeholder="Recipient Address (0x...)"
              className="w-full p-2.5 border text-sm rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <button
              onClick={handleWrapSend}
              disabled={loading || !botAddress || !recipient}
              className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? "Processing..." : "Wrap & Send All"}
            </button>
          </div>
        </div>

        {/* Console / Status Area */}
        <div className="mt-6 space-y-2">
          <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">Transaction Log</label>
          <div className="p-4 bg-gray-900 rounded-lg font-mono text-xs text-green-400 min-h-[60px] break-all border border-gray-800">
            <span className="text-gray-500 select-none">$ </span>
            {status || "Ready for execution..."}
          </div>
        </div>
      </div>
      
      <p className="text-center text-xs text-gray-400 font-light">
        Note: Ensure the Paymaster has sufficient balance in CDP Dashboard.
      </p>
    </div>
  );
}
