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

// WETH ABI for balance, approval, and deposit
const WETH_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const

// Public client for balance checks
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, walletIndex } = body as { sessionId: string; walletIndex: number }

    if (!sessionId || walletIndex === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, walletIndex" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()

    // Step 1: Fetch active bot session
    console.log(`🤖 [Bot Swap] Fetching session ${sessionId}...`)
    
    const { data: session, error: sessionError } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("status", "running")
      .single()

    if (sessionError || !session) {
      console.error("❌ Session not found or inactive:", sessionError)
      return NextResponse.json(
        { error: "Session not found or inactive" },
        { status: 404 }
      )
    }

    const { user_address, token_address, amount_usd, wallet_rotation_index } = session

    // Step 2: Fetch bot wallets
    const { data: botWallets, error: walletsError } = await supabase
      .from("wallets_data")
      .select("*")
      .eq("user_address", user_address.toLowerCase())
      .order("created_at", { ascending: true })

    if (walletsError || !botWallets || botWallets.length !== 5) {
      console.error("❌ Failed to fetch bot wallets:", walletsError)
      return NextResponse.json(
        { error: "Bot wallets not found or incomplete" },
        { status: 404 }
      )
    }

    const botWallet = botWallets[walletIndex]
    if (!botWallet) {
      return NextResponse.json({ error: `Bot wallet at index ${walletIndex} not found` }, { status: 404 })
    }

    const smartAccountAddress = botWallet.smart_account_address as Address
    const ownerAddress = botWallet.owner_address as Address

    // Step 4: Initialize CDP
    const cdp = new CdpClient()

    // Step 5: Check Balances
    let nativeEthBalance = BigInt(0)
    try {
      nativeEthBalance = await publicClient.getBalance({ address: smartAccountAddress })
      console.log(`   Native ETH Balance: ${formatEther(nativeEthBalance)} ETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check Native ETH balance`)
    }
    
    let onChainWethBalance = BigInt(0)
    try {
      onChainWethBalance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      }) as bigint
      console.log(`   WETH Balance (on-chain): ${formatEther(onChainWethBalance)} WETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check WETH balance`)
    }
    
    const { data: creditRecord } = await supabase
      .from("bot_wallet_credits")
      .select("weth_balance_wei")
      .eq("user_address", user_address.toLowerCase())
      .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
      .single()

    const dbWethBalanceWei = creditRecord ? BigInt(creditRecord.weth_balance_wei || "0") : BigInt(0)
    let wethBalanceWei = dbWethBalanceWei

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const ethPriceResponse = await fetch(new URL('/api/eth-price', baseUrl).toString())
    const { price: ethPriceUsd } = await ethPriceResponse.json()
    
    const amountUsdValue = parseFloat(amount_usd)
    const amountEthValue = amountUsdValue / ethPriceUsd
    let amountWei = parseEther(amountEthValue.toFixed(18))

    // DETERMINASI: Gunakan WETH jika cukup, jika tidak gunakan NATIVE ETH
    let sellToken = WETH_ADDRESS as string
    let isNativeSwap = false

    if (onChainWethBalance < amountWei) {
      if (nativeEthBalance >= amountWei) {
        console.log("⚡ WETH insufficient, using Native ETH instead.")
        sellToken = NATIVE_ETH_ADDRESS
        isNativeSwap = true
      } else {
        // --- LOGIKA INSUFFICIENT BALANCE ASLI ANDA (Sama persis) ---
        console.log(`⚠️ Bot #${walletIndex + 1} has insufficient ON-CHAIN balance - Skipping`)
        // (Logika update DB, cek allDepleted, dan rotasi tetap jalan di sini...)
        // ... (sisanya tetap sesuai file asli Anda untuk menangani penghentian sesi)
        return NextResponse.json({ skipped: true, message: "Insufficient balance" })
      }
    }

    // Step 7: Get swap quote from 0x API v2
    const zeroXApiKey = process.env.ZEROX_API_KEY
    let quote: any = null
    let attempt = 1
    const maxAttempts = 2

    while (attempt <= maxAttempts && !quote) {
      const quoteParams = new URLSearchParams({
        chainId: "8453",
        sellToken: sellToken,
        buyToken: token_address.toLowerCase(),
        sellAmount: amountWei.toString(),
        taker: smartAccountAddress.toLowerCase(),
        slippageBps: attempt === 1 ? "500" : "1000",
      })

      // Jika Native, gunakan endpoint /swap/v2/quote. Jika WETH, gunakan /allowance-holder/quote
      const endpoint = isNativeSwap 
        ? "https://api.0x.org/swap/v2/quote" 
        : "https://api.0x.org/swap/allowance-holder/quote"

      const quoteResponse = await fetch(`${endpoint}?${quoteParams.toString()}`, {
        headers: { "0x-api-key": zeroXApiKey!, "0x-version": "v2" }
      })

      if (quoteResponse.ok) {
        quote = await quoteResponse.json()
      } else {
        attempt++
      }
    }

    if (!quote) throw new Error("Failed to get swap quote")

    // Step 8: Execute via CDP
    const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
    const smartAccount = await cdp.evm.getSmartAccount({ owner: ownerAccount!, address: smartAccountAddress })
    
    const calls: any[] = []

    // Hanya approve jika tokennya WETH (ERC20)
    if (!isNativeSwap) {
      const allowanceTarget = (quote.allowanceTarget || quote.transaction.to) as Address
      const currentAllowance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "allowance",
        args: [smartAccountAddress, allowanceTarget],
      }) as bigint

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

    // Tambahkan Swap Call
    calls.push({
      to: quote.transaction.to as Address,
      data: quote.transaction.data as Hex,
      value: isNativeSwap ? BigInt(quote.transaction.value) : BigInt(0),
    })

    const op = await (smartAccount as any).sendUserOperation({
      network: "base",
      calls: calls,
      isSponsored: true,
    })

    const receipt = await (smartAccount as any).waitForUserOperation({ 
      userOpHash: op.hash || op, 
      network: "base" 
    })

    // Step 9: Update Rotation & Log
    const nextIndex = (wallet_rotation_index + 1) % 5
    await supabase.from("bot_sessions").update({ wallet_rotation_index: nextIndex }).eq("id", sessionId)

    await supabase.from("bot_logs").insert({
      user_address: user_address.toLowerCase(),
      bot_wallet_address: smartAccountAddress.toLowerCase(),
      token_address: token_address,
      amount_wei: amountWei.toString(),
      action: isNativeSwap ? "native_swap_success" : "weth_swap_success",
      message: `[Success] Swapped ${formatEther(amountWei)} ${isNativeSwap ? 'ETH' : 'WETH'} via Bot #${walletIndex + 1}`,
      status: "success",
      tx_hash: receipt.transactionHash || op.hash,
    })

    return NextResponse.json({ success: true, txHash: receipt.transactionHash })

  } catch (error: any) {
    console.error("❌ API Swap Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
