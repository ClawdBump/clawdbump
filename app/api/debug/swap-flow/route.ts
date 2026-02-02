import { NextRequest, NextResponse } from "next/server"
import { formatEther, isAddress, type Address, type Hex, createPublicClient, http, encodeFunctionData } from "viem"
import { base } from "viem/chains"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { CdpClient } from "@coinbase/cdp-sdk"
import "dotenv/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const
const BUMP_TOKEN_ADDRESS = "0x8984B389cB82e05016DB2E4c7230ca0791b9Cb07" as const

const ERC20_ABI = [
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
] as const

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { botAddress } = body as { botAddress: string }

    if (!botAddress || !isAddress(botAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing botAddress" },
        { status: 400 }
      )
    }

    console.log(`🤖 [Liquidate] Starting for: ${botAddress}`)

    const apiKeyId = process.env.CDP_API_KEY_ID
    const apiKeySecret = process.env.CDP_API_KEY_SECRET
    const zeroXApiKey = process.env.ZEROX_API_KEY

    if (!apiKeyId || !apiKeySecret) {
      return NextResponse.json(
        { success: false, error: "CDP credentials not configured" },
        { status: 500 }
      )
    }

    if (!zeroXApiKey) {
      return NextResponse.json(
        { success: false, error: "0x API key not configured" },
        { status: 500 }
      )
    }

    const cdp = new CdpClient()
    const supabase = createSupabaseServiceClient()

    const { data: botWallet, error: walletError } = await supabase
      .from("wallets_data")
      .select("*")
      .eq("smart_account_address", botAddress.toLowerCase())
      .single()

    if (walletError || !botWallet) {
      return NextResponse.json(
        { success: false, error: "Bot wallet not found" },
        { status: 404 }
      )
    }

    const smartAccountAddress = botWallet.smart_account_address as Address
    const ownerAddress = botWallet.owner_address as Address

    console.log(`✅ Smart: ${smartAccountAddress}, Owner: ${ownerAddress}`)

    let bumpBalanceWei: bigint
    try {
      bumpBalanceWei = await publicClient.readContract({
        address: BUMP_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      }) as bigint

      console.log(`💰 BUMP Balance: ${formatEther(bumpBalanceWei)}`)
    } catch (balanceError: any) {
      return NextResponse.json(
        { success: false, error: `Failed to check balance: ${balanceError.message}` },
        { status: 500 }
      )
    }

    if (bumpBalanceWei === BigInt(0)) {
      return NextResponse.json({
        success: false,
        error: "No BUMP tokens to liquidate",
        balance: "0",
      })
    }

    let quote: any = null
    let quoteError: any = null
    const maxAttempts = 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const quoteParams = new URLSearchParams({
        chainId: "8453",
        sellToken: BUMP_TOKEN_ADDRESS.toLowerCase(),
        buyToken: WETH_ADDRESS.toLowerCase(),
        sellAmount: bumpBalanceWei.toString(),
        taker: smartAccountAddress.toLowerCase(),
        slippageBps: attempt === 1 ? "500" : "1000",
      })

      const quoteUrlObj = new URL('https://api.0x.org/swap/allowance-holder/quote')
      quoteParams.forEach((value, key) => {
        quoteUrlObj.searchParams.set(key, value)
      })
      const quoteUrl = quoteUrlObj.toString()
      console.log(`🔄 Quote attempt ${attempt} (${attempt === 1 ? "5%" : "10%"} slippage)`)

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          "0x-api-key": zeroXApiKey,
          "0x-version": "v2",
          "Accept": "application/json",
        },
      })

      if (!quoteResponse.ok) {
        try {
          quoteError = await quoteResponse.json()
        } catch (e) {
          quoteError = { message: quoteResponse.statusText }
        }
        
        if (attempt < maxAttempts && 
            (quoteError.message?.includes("no Route matched") || 
             quoteError.message?.includes("INSUFFICIENT_ASSET_LIQUIDITY"))) {
          continue
        }
      } else {
        quote = await quoteResponse.json()
        console.log(`✅ Quote received`)
        break
      }
    }

    if (!quote) {
      return NextResponse.json({
        success: false,
        error: `Failed to get quote: ${quoteError?.message || "Unknown"}`,
        details: quoteError,
      }, { status: 400 })
    }

    const allowanceTarget = quote.allowanceTarget || quote.transaction?.to
    
    if (!allowanceTarget) {
      return NextResponse.json({
        success: false,
        error: "Missing allowanceTarget in quote",
      }, { status: 500 })
    }
    
    console.log(`🔐 Checking approval...`)
    
    let needsApproval = false
    try {
      const currentAllowance = await publicClient.readContract({
        address: BUMP_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [smartAccountAddress, allowanceTarget as Address],
      }) as bigint

      if (currentAllowance < bumpBalanceWei) {
        needsApproval = true
        console.log(`⚠️ Need approval`)
      }
    } catch (e: any) {
      console.warn(`⚠️ Allowance check failed, assuming need approval`)
      needsApproval = true
    }

    if (needsApproval) {
      console.log(`🔐 Approving BUMP...`)
      
      try {
        const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
        if (!ownerAccount) {
          throw new Error("Failed to get Owner Account")
        }

        const smartAccount = await cdp.evm.getSmartAccount({ 
          owner: ownerAccount,
          address: smartAccountAddress 
        })
        if (!smartAccount) {
          throw new Error("Failed to get Smart Account")
        }

        const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [allowanceTarget as Address, maxApproval],
        })

        const approveUserOpHash = await (smartAccount as any).sendUserOperation({
          network: "base",
          calls: [{
            to: BUMP_TOKEN_ADDRESS,
            data: approveData,
            value: BigInt(0),
          }],
          isSponsored: true,
        })

        const approveHash = typeof approveUserOpHash === 'string' 
          ? approveUserOpHash 
          : (approveUserOpHash?.hash || approveUserOpHash?.userOpHash || String(approveUserOpHash))

        console.log(`✅ Approval submitted: ${approveHash}`)

        if (typeof (smartAccount as any).waitForUserOperation === 'function') {
          await (smartAccount as any).waitForUserOperation({
            userOpHash: approveHash,
            network: "base",
          })
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      } catch (approvalError: any) {
        return NextResponse.json({
          success: false,
          error: `Approval failed: ${approvalError.message}`,
        }, { status: 500 })
      }
    }

    console.log(`🚀 Executing swap...`)
    
    try {
      const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
      if (!ownerAccount) {
        throw new Error("Failed to get Owner Account")
      }

      const smartAccount = await cdp.evm.getSmartAccount({ 
        owner: ownerAccount,
        address: smartAccountAddress 
      })
      if (!smartAccount) {
        throw new Error("Failed to get Smart Account")
      }

      const transaction = quote.transaction || quote
      
      if (!transaction.to || !transaction.data) {
        throw new Error("Invalid quote: missing transaction data")
      }

      const userOpHash = await (smartAccount as any).sendUserOperation({
        network: "base",
        calls: [{
          to: transaction.to as Address,
          data: transaction.data as Hex,
          value: BigInt(0),
        }],
        isSponsored: true,
      })

      const txHash = typeof userOpHash === 'string' 
        ? userOpHash 
        : (userOpHash?.hash || userOpHash?.userOpHash || String(userOpHash))

      console.log(`✅ Swap submitted: ${txHash}`)

      if (typeof (smartAccount as any).waitForUserOperation === 'function') {
        await (smartAccount as any).waitForUserOperation({
          userOpHash: txHash,
          network: "base",
        })
      }

      await supabase.from("bot_logs").insert({
        user_address: botWallet.user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: BUMP_TOKEN_ADDRESS,
        amount_wei: bumpBalanceWei.toString(),
        action: "liquidate_bump_to_weth",
        message: `Swapped ${formatEther(bumpBalanceWei)} BUMP to WETH`,
        status: "success",
        created_at: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        txHash,
        message: `Liquidated ${formatEther(bumpBalanceWei)} BUMP to WETH`,
        sellAmount: formatEther(bumpBalanceWei),
        buyAmount: quote.buyAmount ? formatEther(BigInt(quote.buyAmount)) : "unknown",
      })

    } catch (swapError: any) {
      console.error(`❌ Swap failed: ${swapError.message}`)
      
      await supabase.from("bot_logs").insert({
        user_address: botWallet.user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: BUMP_TOKEN_ADDRESS,
        amount_wei: bumpBalanceWei.toString(),
        action: "liquidate_bump_to_weth",
        message: `Failed: ${swapError.message}`,
        status: "error",
        created_at: new Date().toISOString(),
      })

      return NextResponse.json({
        success: false,
        error: `Swap failed: ${swapError.message}`,
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
