import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { CdpClient } from "@coinbase/cdp-sdk"
import { createPublicClient, http, formatEther, parseEther, type Address, type Hex, encodeFunctionData } from "viem"
import { base } from "viem/chains"
import "dotenv/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// --- Constants ---
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const
const NATIVE_ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const

const WETH_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const

// --- Clients Init ---
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
})

// Initialize CDP (Matching Worker Logic)
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET!,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, walletIndex } = body

    // 1. Fetch Session Data
    const { data: session, error: sessError } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("status", "running")
      .single()

    if (sessError || !session) return NextResponse.json({ error: "Session not active" }, { status: 404 })

    // 2. Fetch Wallet Data
    const { data: botWallets, error: walletError } = await supabase
      .from("wallets_data")
      .select("*")
      .eq("user_address", session.user_address.toLowerCase())
      .order("created_at", { ascending: true })

    if (walletError || !botWallets[walletIndex]) return NextResponse.json({ error: "Wallet not found" }, { status: 404 })

    const currentWallet = botWallets[walletIndex]
    const botWalletAddress = currentWallet.smart_account_address as Address
    const ownerAddress = currentWallet.owner_address as Address

    // 3. Calculate Amount & Check Balances
    const ethPriceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
    const ethPriceData = await ethPriceRes.json()
    const ethPriceUsd = ethPriceData.ethereum?.usd || 3000
    
    const amountWei = parseEther((parseFloat(session.amount_usd) / ethPriceUsd).toString())

    const [nativeBalance, wethBalance] = await Promise.all([
      publicClient.getBalance({ address: botWalletAddress }),
      publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [botWalletAddress],
      })
    ])

    // Determine Sell Token Path
    let sellToken = WETH_ADDRESS as string
    let isNative = false

    if (wethBalance < amountWei) {
      if (nativeBalance >= amountWei) {
        sellToken = NATIVE_ETH_ADDRESS
        isNative = true
      } else {
        return NextResponse.json({ error: "Insufficient balance in both ETH and WETH" }, { status: 400 })
      }
    }

    // 4. Get 0x Quote
    const endpoint = isNative 
      ? "https://api.0x.org/swap/v2/quote" 
      : "https://api.0x.org/swap/allowance-holder/quote"

    const quoteParams = new URLSearchParams({
      chainId: "8453",
      sellToken: sellToken,
      buyToken: session.token_address,
      sellAmount: amountWei.toString(),
      taker: botWalletAddress,
      slippageBps: "1000",
    })

    const quoteRes = await fetch(`${endpoint}?${quoteParams.toString()}`, {
      headers: { "0x-api-key": process.env.ZEROX_API_KEY!, "0x-version": "v2" }
    })
    const quote = await quoteRes.json()
    if (!quoteRes.ok) throw new Error(quote.message || "0x API Error")

    const transaction = quote.transaction

    // 5. Setup CDP Accounts
    const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
    const smartAccount = await cdp.evm.getSmartAccount({ owner: ownerAccount!, address: botWalletAddress })

    const calls: any[] = []

    // 6. Handle Allowance for WETH
    if (!isNative) {
      const allowanceTarget = (quote.allowanceTarget || transaction.to) as Address
      const currentAllowance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "allowance",
        args: [botWalletAddress, allowanceTarget],
      })

      if (currentAllowance < amountWei) {
        calls.push({
          to: WETH_ADDRESS,
          data: encodeFunctionData({
            abi: WETH_ABI,
            functionName: "approve",
            args: [allowanceTarget, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
          }),
          value: BigInt(0),
        })
      }
    }

    // 7. Add Swap Call
    calls.push({
      to: transaction.to as Address,
      data: transaction.data as Hex,
      value: isNative ? BigInt(transaction.value) : BigInt(0),
    })

    // 8. Execute Operation
    console.log(`🚀 Executing ${isNative ? 'Native ETH' : 'WETH'} swap via API...`)
    const op = await (smartAccount as any).sendUserOperation({
      network: "base",
      calls: calls,
      isSponsored: true,
    })

    // Wait for result
    const receipt = await (smartAccount as any).waitForUserOperation({ 
      userOpHash: op.hash || op, 
      network: "base" 
    })
    
    const txHash = receipt.transactionHash || op.hash || String(op)

    // 9. Final Logs
    await supabase.from("bot_logs").insert({
      user_address: session.user_address.toLowerCase(),
      bot_wallet_address: botWalletAddress.toLowerCase(),
      token_address: session.token_address,
      amount_wei: amountWei.toString(),
      action: isNative ? "native_eth_swap_api" : "weth_swap_api",
      message: `[API] Swapped ${formatEther(amountWei)} ${isNative ? 'ETH' : 'WETH'}`,
      status: "success",
      tx_hash: txHash,
    })

    return NextResponse.json({ success: true, txHash })

  } catch (error: any) {
    console.error("❌ API Swap Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
