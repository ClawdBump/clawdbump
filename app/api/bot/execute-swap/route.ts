import { NextRequest, NextResponse } from "next/server"
import { formatEther, parseEther, isAddress, type Address, type Hex, createPublicClient, http, encodeFunctionData } from "viem"
import { base } from "viem/chains"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { CdpClient } from "@coinbase/cdp-sdk"
import "dotenv/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Constants
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const
const NATIVE_ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const

const WETH_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, walletIndex } = body as { sessionId: string; walletIndex: number }

    if (!sessionId || walletIndex === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    // 1. Fetch Session
    const { data: session } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("status", "running")
      .single()

    if (!session) return NextResponse.json({ error: "Session inactive" }, { status: 404 })

    const { user_address, token_address, amount_usd, wallet_rotation_index } = session

    // 2. Fetch Wallets
    const { data: botWallets } = await supabase
      .from("wallets_data")
      .select("*")
      .eq("user_address", user_address.toLowerCase())
      .order("created_at", { ascending: true })

    if (!botWallets || botWallets.length !== 5) return NextResponse.json({ error: "Wallets missing" }, { status: 404 })

    const botWallet = botWallets[walletIndex]
    const smartAccountAddress = botWallet.smart_account_address as Address
    const ownerAddress = botWallet.owner_address as Address

    // 3. Initialize CDP
    const cdp = new CdpClient()

    // 4. Balance Checks (Native + WETH)
    const [nativeEthBalance, onChainWethBalance] = await Promise.all([
      publicClient.getBalance({ address: smartAccountAddress }),
      publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      }),
    ])

    // Get ETH Price
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const ethPriceRes = await fetch(new URL('/api/eth-price', baseUrl).toString())
    const { price: ethPriceUsd } = await ethPriceRes.json()

    const amountEthValue = parseFloat(amount_usd) / ethPriceUsd
    const amountWei = BigInt(Math.floor(amountEthValue * 1e18))

    // 5. Determine Sell Token Path
    let sellToken = WETH_ADDRESS;
    let isNative = false;

    if (onChainWethBalance < amountWei) {
      console.log("⚠️ WETH insufficient, checking Native ETH...")
      if (nativeEthBalance >= amountWei) {
        sellToken = NATIVE_ETH_ADDRESS;
        isNative = true;
        console.log("✅ Using Native ETH for swap")
      } else {
        console.log("❌ Insufficient total balance. Skipping/Stopping.")
        // [Logic for rotation/stop session goes here as per your original script]
        return NextResponse.json({ skipped: true, reason: "Insufficient balance" })
      }
    }

    // 6. Get 0x Quote
    const zeroXApiKey = process.env.ZEROX_API_KEY!
    const endpoint = isNative 
      ? "https://api.0x.org/swap/v2/quote" 
      : "https://api.0x.org/swap/allowance-holder/quote";

    const params = new URLSearchParams({
      chainId: "8453",
      sellToken: sellToken.toLowerCase(),
      buyToken: token_address.toLowerCase(),
      sellAmount: amountWei.toString(),
      taker: smartAccountAddress.toLowerCase(),
      slippageBps: "500", // 5%
    })

    console.log(`📡 Fetching quote from: ${endpoint}`)
    const quoteRes = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { "0x-api-key": zeroXApiKey, "0x-version": "v2" }
    })

    const quote = await quoteRes.json()
    if (!quoteRes.ok) throw new Error(quote.reason || "Quote failed")

    // 7. Execute Transaction
    const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
    const smartAccount = await cdp.evm.getSmartAccount({ owner: ownerAccount!, address: smartAccountAddress })

    const call = {
      to: quote.transaction.to as Address,
      data: quote.transaction.data as Hex,
      value: isNative ? BigInt(quote.transaction.value) : BigInt(0),
    }

    console.log(`🚀 Executing ${isNative ? 'Native ETH' : 'WETH'} swap...`)
    const userOp = await (smartAccount as any).sendUserOperation({
      network: "base",
      calls: [call],
      isSponsored: true,
    })

    // 8. Update DB & Logs
    const txHash = typeof userOp === 'string' ? userOp : (userOp?.hash || "pending")
    
    await supabase.from("bot_logs").insert({
      user_address: user_address.toLowerCase(),
      bot_wallet_address: smartAccountAddress.toLowerCase(),
      token_address: token_address,
      amount_wei: amountWei.toString(),
      action: isNative ? "native_eth_swap" : "weth_swap",
      message: `Swapped ${formatEther(amountWei)} ${isNative ? 'ETH' : 'WETH'} for token`,
      status: "success",
      tx_hash: txHash,
    })

    return NextResponse.json({ success: true, txHash })

  } catch (error: any) {
    console.error("❌ Swap Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
