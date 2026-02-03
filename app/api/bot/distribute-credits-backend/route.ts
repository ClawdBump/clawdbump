import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { CdpClient } from "@coinbase/cdp-sdk"
import { createPublicClient, http, formatEther, formatUnits, getAddress, encodeFunctionData, type Address, type Hex } from "viem"
import { base } from "viem/chains"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// WETH Contract Address (Base Network)
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const

// WETH ABI
const WETH_ABI = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

// Multicall3 Contract Address
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const

const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3Value",
    outputs: [
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const

/**
 * API Endpoint: Distribute Credits from Main Wallet to Bot Wallets (Backend)
 * 
 * This endpoint distributes credits from user's main Smart Wallet to 5 bot wallets
 * WITHOUT requiring user approval (executed in backend using CDP SDK).
 * 
 * Flow:
 * 1. Fetch user's main Smart Wallet address and bot wallets
 * 2. Check credit balance from database
 * 3. Calculate distribution amounts
 * 4. Convert Native ETH to WETH if needed
 * 5. Distribute to bot wallets using batch transaction
 * 6. Record distribution in database
 * 
 * Request Body:
 * - userAddress: User's main Smart Wallet address
 * - preferNativeEth: (Optional) If true, distribute Native ETH instead of WETH
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress, preferNativeEth = false } = body as {
      userAddress: string
      preferNativeEth?: boolean
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const normalizedUserAddress = userAddress.toLowerCase()

    // Initialize CDP Client
    const cdpApiKeyId = process.env.CDP_API_KEY_ID!
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET!

    if (!cdpApiKeyId || !cdpApiKeySecret) {
      return NextResponse.json(
        { error: "CDP credentials not configured" },
        { status: 500 }
      )
    }

    const cdp = new CdpClient({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
    })

    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    })

    console.log(`\n💰 [Backend] Distributing credits for ${normalizedUserAddress}...`)

    // Step 1: Fetch bot wallets
    const { data: botWallets, error: walletsError } = await supabase
      .from("wallets_data")
      .select("smart_account_address, owner_address")
      .eq("user_address", normalizedUserAddress)
      .order("created_at", { ascending: true })

    if (walletsError || !botWallets || botWallets.length !== 5) {
      return NextResponse.json(
        { error: "Bot wallets not found or incomplete" },
        { status: 404 }
      )
    }

    // Step 2: Get main wallet credit balance
    const creditResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/credit-balance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      }
    )

    const creditData = await creditResponse.json()
    const mainWalletCreditWei = BigInt(creditData.mainWalletCreditWei || "0")

    if (mainWalletCreditWei <= BigInt(0)) {
      return NextResponse.json(
        { error: "No credit available in main wallet" },
        { status: 400 }
      )
    }

    // Step 3: Get main wallet on-chain balance
    const mainWalletAddress = getAddress(userAddress)
    const nativeEthBalance = await publicClient.getBalance({
      address: mainWalletAddress,
    })

    let wethBalance = BigInt(0)
    try {
      wethBalance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const,
        functionName: "balanceOf",
        args: [mainWalletAddress],
      }) as bigint
    } catch {}

    // Step 4: Calculate distribution
    const totalOnChainBalance = nativeEthBalance + wethBalance
    const creditToDistribute = mainWalletCreditWei > totalOnChainBalance 
      ? totalOnChainBalance 
      : mainWalletCreditWei

    const amountPerBot = creditToDistribute / BigInt(5)
    const amountForFirstBot = creditToDistribute - (amountPerBot * BigInt(4))

    console.log(`   → Credit to distribute: ${formatEther(creditToDistribute)} ETH`)
    console.log(`   → Per bot wallet: ${formatEther(amountPerBot)} ETH`)
    console.log(`   → First bot (with remainder): ${formatEther(amountForFirstBot)} ETH`)

    // Step 5: Get Owner Account for main wallet
    // Note: For main wallet, we need to use the user's Privy Smart Account
    // This requires the owner address from the user's account
    // For now, we'll use the first bot wallet's owner as a proxy
    // In production, you'd store the main wallet's owner address separately

    const firstBotWallet = botWallets[0]
    if (!firstBotWallet.owner_address) {
      return NextResponse.json(
        { error: "Owner address not found for bot wallets" },
        { status: 500 }
      )
    }

    // Step 6: Distribute credits
    const distributions: Array<{
      botWalletAddress: string
      nativeEthAmountWei: string
      wethAmountWei: string
    }> = []

    let totalDistributedWei = BigInt(0)

    if (preferNativeEth) {
      // Distribute Native ETH directly
      console.log(`\n📤 Distributing Native ETH...`)

      const multicallCalls = botWallets.map((wallet, index) => {
        const amount = index === 0 ? amountForFirstBot : amountPerBot
        return {
          target: getAddress(wallet.smart_account_address),
          allowFailure: false,
          value: amount,
          callData: '0x' as Hex,
        }
      })

      const multicallData = encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3Value",
        args: [multicallCalls],
      })

      // Use first bot's owner to execute (as proxy for main wallet)
      // In production, use main wallet's actual owner
      const ownerAccount = await cdp.evm.getAccount({
        address: firstBotWallet.owner_address as Address,
      })

      if (!ownerAccount) {
        throw new Error("Failed to get Owner Account")
      }

      const smartAccount = await cdp.evm.getSmartAccount({
        owner: ownerAccount,
        address: mainWalletAddress,
      })

      if (!smartAccount) {
        throw new Error("Failed to get Smart Account")
      }

      const totalAmount = multicallCalls.reduce((sum, call) => sum + call.value, BigInt(0))

      const userOpHash = await (smartAccount as any).sendUserOperation({
        network: "base",
        calls: [{
          to: MULTICALL3_ADDRESS,
          data: multicallData,
          value: totalAmount,
        }],
        isSponsored: true,
      })

      const txHash = typeof userOpHash === 'string'
        ? userOpHash
        : (userOpHash?.hash || userOpHash?.userOpHash || String(userOpHash))

      console.log(`   ✅ Distribution transaction submitted: ${txHash}`)

      // Wait for confirmation
      if (typeof (smartAccount as any).waitForUserOperation === 'function') {
        await (smartAccount as any).waitForUserOperation({
          userOpHash: txHash,
          network: "base",
        })
      }

      // Record distributions
      for (let i = 0; i < botWallets.length; i++) {
        const amount = i === 0 ? amountForFirstBot : amountPerBot
        distributions.push({
          botWalletAddress: botWallets[i].smart_account_address,
          nativeEthAmountWei: amount.toString(),
          wethAmountWei: "0",
        })
        totalDistributedWei += amount
      }
    } else {
      // Distribute WETH (convert Native ETH to WETH if needed)
      console.log(`\n📤 Distributing WETH...`)

      const wethNeeded = creditToDistribute > wethBalance ? creditToDistribute - wethBalance : BigInt(0)

      if (wethNeeded > BigInt(0)) {
        // Convert Native ETH to WETH
        console.log(`   → Converting ${formatEther(wethNeeded)} Native ETH to WETH...`)

        const ownerAccount = await cdp.evm.getAccount({
          address: firstBotWallet.owner_address as Address,
        })

        if (!ownerAccount) {
          throw new Error("Failed to get Owner Account")
        }

        const smartAccount = await cdp.evm.getSmartAccount({
          owner: ownerAccount,
          address: mainWalletAddress,
        })

        if (!smartAccount) {
          throw new Error("Failed to get Smart Account")
        }

        const depositData = encodeFunctionData({
          abi: WETH_ABI,
          functionName: "deposit",
        })

        const depositUserOpHash = await (smartAccount as any).sendUserOperation({
          network: "base",
          calls: [{
            to: WETH_ADDRESS,
            value: wethNeeded,
            data: depositData,
          }],
          isSponsored: true,
        })

        const depositHash = typeof depositUserOpHash === 'string'
          ? depositUserOpHash
          : (depositUserOpHash?.hash || depositUserOpHash?.userOpHash || String(depositUserOpHash))

        console.log(`   ✅ WETH deposit submitted: ${depositHash}`)

        if (typeof (smartAccount as any).waitForUserOperation === 'function') {
          await (smartAccount as any).waitForUserOperation({
            userOpHash: depositHash,
            network: "base",
          })
        }
      }

      // Distribute WETH to bot wallets
      const transferCalls = botWallets.map((wallet, index) => {
        const amount = index === 0 ? amountForFirstBot : amountPerBot
        const transferData = encodeFunctionData({
          abi: WETH_ABI,
          functionName: "transfer",
          args: [getAddress(wallet.smart_account_address), amount],
        })

        return {
          target: WETH_ADDRESS,
          allowFailure: false,
          value: BigInt(0),
          callData: transferData,
        }
      })

      const multicallData = encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3Value",
        args: [transferCalls],
      })

      const ownerAccount = await cdp.evm.getAccount({
        address: firstBotWallet.owner_address as Address,
      })

      if (!ownerAccount) {
        throw new Error("Failed to get Owner Account")
      }

      const smartAccount = await cdp.evm.getSmartAccount({
        owner: ownerAccount,
        address: mainWalletAddress,
      })

      if (!smartAccount) {
        throw new Error("Failed to get Smart Account")
      }

      const transferUserOpHash = await (smartAccount as any).sendUserOperation({
        network: "base",
        calls: [{
          to: MULTICALL3_ADDRESS,
          data: multicallData,
          value: BigInt(0),
        }],
        isSponsored: true,
      })

      const transferHash = typeof transferUserOpHash === 'string'
        ? transferUserOpHash
        : (transferUserOpHash?.hash || transferUserOpHash?.userOpHash || String(transferUserOpHash))

      console.log(`   ✅ WETH distribution submitted: ${transferHash}`)

      if (typeof (smartAccount as any).waitForUserOperation === 'function') {
        await (smartAccount as any).waitForUserOperation({
          userOpHash: transferHash,
          network: "base",
        })
      }

      // Record distributions
      for (let i = 0; i < botWallets.length; i++) {
        const amount = i === 0 ? amountForFirstBot : amountPerBot
        distributions.push({
          botWalletAddress: botWallets[i].smart_account_address,
          nativeEthAmountWei: "0",
          wethAmountWei: amount.toString(),
        })
        totalDistributedWei += amount
      }
    }

    // Step 7: Record distribution in database
    const recordResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bot/record-distribution`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress,
          distributions,
          txHash: "backend-distribution", // Will be updated with actual hash
        }),
      }
    )

    if (!recordResponse.ok) {
      console.warn("⚠️ Failed to record distribution in database")
    }

    console.log(`✅ Distribution completed successfully`)

    return NextResponse.json({
      success: true,
      message: "Credits distributed successfully",
      distributions: distributions.length,
      totalDistributedWei: totalDistributedWei.toString(),
    })
  } catch (error: any) {
    console.error("❌ Error in distribute-credits-backend API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

