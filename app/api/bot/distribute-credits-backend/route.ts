import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { PrivyClient } from "@privy-io/node"
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

    // Initialize Privy Client
    const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!
    const privyAppSecret = process.env.PRIVY_APP_SECRET!

    if (!privyAppId || !privyAppSecret) {
      return NextResponse.json(
        { error: "Privy credentials not configured. Please set PRIVY_APP_SECRET in environment variables." },
        { status: 500 }
      )
    }

    const privy = new PrivyClient(privyAppId, privyAppSecret)

    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    })

    console.log(`\n💰 [Backend] Distributing credits for ${normalizedUserAddress}...`)

    // Get user's Privy user ID from database
    const { data: userMapping, error: userMappingError } = await supabase
      .from("telegram_user_mappings")
      .select("privy_user_id")
      .eq("wallet_address", normalizedUserAddress)
      .single()

    if (userMappingError || !userMapping?.privy_user_id) {
      return NextResponse.json(
        { 
          error: "User not found in database. Please ensure user has logged in via Privy.",
          hint: "The privy_user_id should be stored in telegram_user_mappings when user logs in via Privy."
        },
        { status: 404 }
      )
    }

    const privyUserId = userMapping.privy_user_id
    console.log(`   → Privy User ID: ${privyUserId}`)

    // Get user's embedded wallet (EOA) from Privy
    // This is the EOA that owns the Privy Smart Account
    console.log(`   → Getting user's embedded wallet from Privy...`)
    let embeddedWalletAddress: Address
    try {
      const user = await privy.getUser(privyUserId)
      
      // Find embedded wallet (EOA) from linked accounts
      const embeddedWallet = user.linkedAccounts?.find(
        (account: any) => account.type === "wallet" && account.walletClientType === "privy"
      )
      
      if (!embeddedWallet?.address) {
        throw new Error("Embedded wallet not found for user")
      }
      
      embeddedWalletAddress = getAddress(embeddedWallet.address)
      console.log(`   ✅ Embedded wallet address: ${embeddedWalletAddress}`)
    } catch (error: any) {
      console.error(`   ❌ Error getting embedded wallet: ${error.message}`)
      return NextResponse.json(
        { error: `Failed to get user's embedded wallet: ${error.message}` },
        { status: 500 }
      )
    }

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

    // Step 5: Use Privy SDK to sign and send transactions
    // Privy SDK will handle signing from the embedded wallet (EOA)
    // The Smart Account will execute the transaction automatically
    console.log(`   → Using Privy SDK to sign transactions from embedded wallet...`)

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

      const totalAmount = multicallCalls.reduce((sum, call) => sum + call.value, BigInt(0))

      // Execute transaction using Privy Smart Wallet SDK approach
      // Since we're in backend, we use Privy's REST API to send transaction
      // Privy will handle signing from embedded wallet and execution on Smart Account
      console.log(`   → Executing transaction via Privy API...`)
      
      // Use Privy's REST API endpoint for sending transactions
      // This mimics the frontend smartWalletClient.sendTransaction() behavior
      const privyApiUrl = `https://auth.privy.io/api/v1/users/${privyUserId}/wallets/${mainWalletAddress}/transactions`
      
      const txResponse = await fetch(privyApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${privyAppSecret}`,
          "privy-app-id": privyAppId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          network: "base",
          to: MULTICALL3_ADDRESS,
          data: multicallData,
          value: totalAmount.toString(),
          // Privy will automatically handle:
          // - Signing from embedded wallet (EOA)
          // - Executing on Smart Account
          // - Gas sponsorship (if configured)
        }),
      })

      if (!txResponse.ok) {
        const errorData = await txResponse.json().catch(() => ({ message: txResponse.statusText }))
        console.error(`❌ Privy API error:`, errorData)
        throw new Error(`Privy API error: ${errorData.message || txResponse.statusText}`)
      }

      const txData = await txResponse.json()
      // Privy returns transaction hash in different formats
      const txHash = txData.txHash || txData.hash || txData.transactionHash || txData.userOpHash

      if (!txHash) {
        console.error(`❌ Privy API response:`, txData)
        throw new Error("No transaction hash returned from Privy API")
      }

      console.log(`   ✅ Distribution transaction submitted: ${txHash}`)

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 120_000, // 2 minutes
      })
      
      console.log(`   ✅ Transaction confirmed: ${txHash}`)

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

        const depositData = encodeFunctionData({
          abi: WETH_ABI,
          functionName: "deposit",
        })

        // Execute WETH deposit transaction using Privy API
        // Similar to frontend: smartWalletClient.sendTransaction({ to: WETH_ADDRESS, value: wethNeeded, data: depositData })
        const privyApiUrl = `https://auth.privy.io/api/v1/users/${privyUserId}/wallets/${mainWalletAddress}/transactions`
        
        const depositResponse = await fetch(privyApiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${privyAppSecret}`,
            "privy-app-id": privyAppId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            network: "base",
            to: WETH_ADDRESS,
            value: wethNeeded.toString(),
            data: depositData,
          }),
        })

        if (!depositResponse.ok) {
          const errorData = await depositResponse.json().catch(() => ({ message: depositResponse.statusText }))
          console.error(`❌ Privy API error:`, errorData)
          throw new Error(`Privy API error: ${errorData.message || depositResponse.statusText}`)
        }

        const depositData_response = await depositResponse.json()
        const depositHash = depositData_response.txHash || depositData_response.hash || depositData_response.transactionHash || depositData_response.userOpHash

        if (!depositHash) {
          console.error(`❌ Privy API response:`, depositData_response)
          throw new Error("No transaction hash returned from Privy API")
        }

        console.log(`   ✅ WETH deposit submitted: ${depositHash}`)

        // Wait for transaction confirmation
        await publicClient.waitForTransactionReceipt({
          hash: depositHash as `0x${string}`,
          timeout: 120_000,
        })
        
        console.log(`   ✅ WETH deposit confirmed: ${depositHash}`)
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

      // Execute WETH transfer transaction using Privy API
      // Similar to frontend: smartWalletClient.sendTransaction({ to: MULTICALL3_ADDRESS, data: multicallData, value: 0 })
      const privyApiUrl = `https://auth.privy.io/api/v1/users/${privyUserId}/wallets/${mainWalletAddress}/transactions`
      
      const transferResponse = await fetch(privyApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${privyAppSecret}`,
          "privy-app-id": privyAppId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          network: "base",
          to: MULTICALL3_ADDRESS,
          data: multicallData,
          value: "0",
        }),
      })

      if (!transferResponse.ok) {
        const errorData = await transferResponse.json().catch(() => ({ message: transferResponse.statusText }))
        console.error(`❌ Privy API error:`, errorData)
        throw new Error(`Privy API error: ${errorData.message || transferResponse.statusText}`)
      }

      const transferData_response = await transferResponse.json()
      const transferHash = transferData_response.txHash || transferData_response.hash || transferData_response.transactionHash || transferData_response.userOpHash

      if (!transferHash) {
        console.error(`❌ Privy API response:`, transferData_response)
        throw new Error("No transaction hash returned from Privy API")
      }

      console.log(`   ✅ WETH distribution submitted: ${transferHash}`)

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({
        hash: transferHash as `0x${string}`,
        timeout: 120_000,
      })
      
      console.log(`   ✅ WETH distribution confirmed: ${transferHash}`)

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

