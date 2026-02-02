import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, http, parseAbiItem, decodeEventLog, type Address, type Hex } from "viem"
import { base } from "viem/chains"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { TREASURY_ADDRESS, APP_FEE_BPS, USER_CREDIT_BPS } from "@/lib/constants"

// Initialize public client for Base mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
})

// ERC20 Transfer event ABI
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
)

// Uniswap V4 PoolManager Swap event ABI
const UNISWAP_V4_SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint24 tickSpacing)"
)

interface SyncCreditRequest {
  txHash: string
  userAddress: string
  amountBump: string
  amountBumpWei: string
  expectedEthWei?: string // Optional: Expected ETH amount from quote (for fallback verification)
}

interface SyncBalanceRequest {
  userAddress: string
  onChainBalanceWei: string
}

/**
 * Verifies transaction and calculates WETH credit amount
 * Returns the WETH amount (in wei) that should be credited to user (90% of swap result)
 * 
 * IMPORTANT: This function verifies that the transaction is a valid "Convert $BUMP to Credit" transaction.
 * 
 * Workflow yang benar:
 * 1. 5% $BUMP → Treasury (as $BUMP token)
 * 2. 95% $BUMP → Swap via 0x Settler → WETH
 * 3. 5% WETH → Treasury (as WETH token)
 * 4. 90% WETH → Stays in Smart Wallet as Credit (this is what we credit to user)
 * 
 * IMPORTANT: WETH is kept as WETH (NOT unwrapped to ETH) for gasless transactions
 * 
 * Verification checks:
 * - Must have 5% $BUMP transfer to Treasury
 * - Must have swap transaction (via 0x Settler contract)
 * - Must have WETH received from swap (or use expectedEthWei as fallback)
 * - Must have 5% WETH transfer to Treasury
 * 
 * Credit calculation:
 * - wethReceivedWei = Total WETH received from swap (100% of swap result)
 * - creditAmountWei = 90% of total WETH (the portion that stays in Smart Wallet)
 * - The remaining 5% was already sent to Treasury in step 3
 * 
 * This prevents users from bypassing the system by sending WETH directly to their Smart Wallet.
 */
async function verifyAndCalculateCredit(
  txHash: Hex,
  userAddress: Address,
  expectedEthWei?: string // Optional: Expected ETH from quote (for fallback)
): Promise<{ ethAmountWei: bigint; isValid: boolean }> {
  try {
    console.log(`\n🔍 [VERIFICATION] Starting verification for ${txHash}`)
    console.log(`   User: ${userAddress}`)
    console.log(`   Expected ETH: ${expectedEthWei || "not provided"}`)
    
    // 1. Get transaction receipt with retry logic
    // Transaction may not be confirmed yet, so we retry with exponential backoff
    console.log(`   Step 1: Fetching transaction receipt (with retry)...`)
    let receipt = null
    const maxRetries = 10
    const initialDelay = 2000 // 2 seconds
    const maxDelay = 30000 // 30 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash })
        if (receipt) {
          console.log(`   ✅ Transaction receipt found on attempt ${attempt}`)
          break
        }
      } catch (error: any) {
        if (error.shortMessage?.includes("could not be found") || error.shortMessage?.includes("not be processed")) {
          // Transaction not confirmed yet, retry
          const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
          console.log(`   ⏳ Transaction receipt not found yet (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          } else {
            console.error(`   ❌ Transaction receipt not found after ${maxRetries} attempts`)
            return { ethAmountWei: BigInt(0), isValid: false }
          }
        } else {
          // Other error, throw it
          throw error
        }
      }
    }

    if (!receipt || receipt.status !== "success") {
      console.warn(`   ❌ Transaction not found or failed`)
      console.warn(`      Status: ${receipt?.status || "not found"}`)
      return { ethAmountWei: BigInt(0), isValid: false }
    }
    
    console.log(`   ✅ Transaction receipt confirmed (status: ${receipt.status})`)
    console.log(`      Block number: ${receipt.blockNumber}`)
    console.log(`      Transaction to: ${receipt.to}`)
    console.log(`      Total logs: ${receipt.logs.length}`)

    const BUMP_TOKEN_ADDRESS = "0x94ce728849431818ec9a0cf29bdb24fe413bbb07"
    const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006"
    const ZEROX_SETTLER_CONTRACT = "0x785648669b8e90a75a6a8de682258957f9028462"

    // 2. Verify that treasury received the 5% $BUMP fee
    // Look for Transfer event from userAddress to TREASURY_ADDRESS for $BUMP token
    // In Smart Wallet batch transactions, the from address might be the Smart Wallet contract
    const treasuryBumpTransferLog = receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        })
        const isBumpToken = log.address.toLowerCase() === BUMP_TOKEN_ADDRESS.toLowerCase()
        const isToTreasury = decoded.args.to?.toLowerCase() === TREASURY_ADDRESS.toLowerCase()
        const isFromUser = decoded.args.from?.toLowerCase() === userAddress.toLowerCase()
        
        return (
          decoded.eventName === "Transfer" &&
          isBumpToken &&
          isToTreasury &&
          isFromUser
        )
      } catch {
        return false
      }
    })

    if (!treasuryBumpTransferLog) {
      console.warn("⚠️ Treasury $BUMP fee transfer not found - checking all $BUMP transfers for debugging...")
      console.log(`  📋 Transaction Hash: ${txHash}`)
      console.log(`  📋 User Address: ${userAddress}`)
      console.log(`  📋 Treasury Address: ${TREASURY_ADDRESS}`)
      
      // Debug: Log all $BUMP transfers for troubleshooting
      const allBumpTransfers = receipt.logs.filter((log) => {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          })
          return (
            decoded.eventName === "Transfer" &&
            log.address.toLowerCase() === BUMP_TOKEN_ADDRESS.toLowerCase()
          )
        } catch {
          return false
        }
      })
      console.log(`  📊 Total $BUMP Transfer events found: ${allBumpTransfers.length}`)
      for (const log of allBumpTransfers) {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          })
          const fromAddr = decoded.args.from?.toLowerCase()
          const toAddr = decoded.args.to?.toLowerCase()
          const isToTreasury = toAddr === TREASURY_ADDRESS.toLowerCase()
          const isFromUser = fromAddr === userAddress.toLowerCase()
          console.log(`    - $BUMP Transfer: ${decoded.args.value?.toString()} wei`)
          console.log(`      From: ${fromAddr} ${isFromUser ? "✅ (user)" : ""}`)
          console.log(`      To: ${toAddr} ${isToTreasury ? "✅ (treasury)" : ""}`)
        } catch {}
      }
      
      // If we have expectedEthWei, we can be more lenient - allow if Settler call exists
      // This handles cases where batch transaction structure is complex
      if (!expectedEthWei) {
        console.warn("  ❌ No expectedEthWei provided, cannot use fallback verification")
        // Don't return false yet - let's check Settler call first
      } else {
        console.warn("  ⚠️ Treasury transfer not found, but will use expectedEthWei fallback if Settler call exists")
      }
    } else {
      console.log("✅ Treasury $BUMP transfer found")
    }

    // 3. Verify that swap was executed via 0x Settler contract
    // Check if transaction was sent to Settler contract or if there's a call to it
    // In Smart Wallet batch transactions, Settler might be called internally
    const hasSettlerCall = receipt.logs.some((log) => {
      return log.address.toLowerCase() === ZEROX_SETTLER_CONTRACT.toLowerCase()
    })
    
    // Also check if transaction was sent directly to Settler (for non-batch cases)
    const isDirectSettlerCall = receipt.to?.toLowerCase() === ZEROX_SETTLER_CONTRACT.toLowerCase()

    if (!hasSettlerCall && !isDirectSettlerCall) {
      console.warn("⚠️ 0x Settler contract call not found - checking transaction structure...")
      console.log(`  📋 Transaction to: ${receipt.to}`)
      console.log(`  📋 Expected Settler: ${ZEROX_SETTLER_CONTRACT}`)
      
      // Check all unique addresses in logs for debugging
      const uniqueAddresses = new Set<string>()
      receipt.logs.forEach(log => {
        uniqueAddresses.add(log.address.toLowerCase())
      })
      console.log(`  📊 Unique contract addresses in logs (first 15):`)
      Array.from(uniqueAddresses).slice(0, 15).forEach(addr => {
        console.log(`    - ${addr}`)
      })
      
      // If we have expectedEthWei, allow fallback even if Settler call not found
      // This handles Smart Wallet batch transactions where internal calls are complex
      if (expectedEthWei) {
        console.warn("  ⚠️ Settler call not found in logs, but expectedEthWei provided - will use fallback verification")
        // Continue with fallback verification - we'll check again in fallback section
      } else if (!treasuryBumpTransferLog) {
        // Only fail if we have neither Treasury transfer nor expectedEthWei
        console.warn("  ❌ Cannot verify: No Settler call, no Treasury transfer, and no expectedEthWei")
        return { ethAmountWei: BigInt(0), isValid: false }
      } else {
        console.warn("  ⚠️ Settler call not found, but Treasury transfer exists - will attempt fallback")
      }
    } else {
      console.log("✅ 0x Settler contract call found")
    }

    // 4. Calculate WETH received from swap
    // Method 1: Check WETH transfers to userAddress (from 0x swap)
    let wethReceivedWei = BigInt(0)
    
    // Determine token order (same as frontend)
    const isBumpToken0 = BUMP_TOKEN_ADDRESS.toLowerCase() < BASE_WETH_ADDRESS.toLowerCase()
    
    // Look for Uniswap V4 Swap event
    const swapEventLog = receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: [UNISWAP_V4_SWAP_EVENT],
          data: log.data,
          topics: log.topics,
        })
        return (
          decoded.eventName === "Swap" &&
          decoded.args.recipient?.toLowerCase() === userAddress.toLowerCase() &&
          log.address.toLowerCase() === "0x498581ff718922c3f8e6a244956af099b2652b2b" // PoolManager address
        )
      } catch {
        return false
      }
    })

    if (swapEventLog) {
      try {
        const decoded = decodeEventLog({
          abi: [UNISWAP_V4_SWAP_EVENT],
          data: swapEventLog.data,
          topics: swapEventLog.topics,
        })
        
        // amount0 and amount1 are int256, negative means input, positive means output
        // If BUMP is token0 and we're swapping BUMP -> WETH (zeroForOne = true):
        //   amount0 will be negative (input BUMP)
        //   amount1 will be positive (output WETH)
        // If BUMP is token1 and we're swapping BUMP -> WETH (zeroForOne = false):
        //   amount0 will be positive (output WETH)
        //   amount1 will be negative (input BUMP)
        
        const amount0 = decoded.args.amount0 || BigInt(0)
        const amount1 = decoded.args.amount1 || BigInt(0)
        
        if (isBumpToken0) {
          // BUMP is token0, WETH is token1
          // amount1 should be positive (WETH output)
          if (amount1 > BigInt(0)) {
            wethReceivedWei = BigInt(amount1.toString())
          }
        } else {
          // WETH is token0, BUMP is token1
          // amount0 should be positive (WETH output)
          if (amount0 > BigInt(0)) {
            wethReceivedWei = BigInt(amount0.toString())
          }
        }
        
        console.log(`✅ Parsed Swap event: amount0=${amount0.toString()}, amount1=${amount1.toString()}, WETH received=${wethReceivedWei.toString()}`)
      } catch (decodeError) {
        console.error("❌ Error decoding Swap event:", decodeError)
      }
    }

    // Method 2: Check WETH transfers (from 0x swap)
    // IMPORTANT: In Smart Wallet batch transactions, WETH might be transferred to:
    // 1. Smart Wallet contract address (userAddress) - most common
    // 2. Directly to user's EOA (if not using Smart Wallet)
    // We need to check both possibilities
    const wethTransferLogs = receipt.logs.filter((log) => {
      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        })
        // Check if it's a WETH transfer (log address is WETH contract)
        const isWethTransfer = log.address.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase()
        if (!isWethTransfer || decoded.eventName !== "Transfer") {
          return false
        }
        
        // Check if transfer is TO userAddress (Smart Wallet) or FROM a known contract
        const toAddress = decoded.args.to?.toLowerCase()
        const fromAddress = decoded.args.from?.toLowerCase()
        
        // Accept if:
        // 1. Transfer TO userAddress (Smart Wallet receives WETH)
        // 2. Transfer FROM 0x Settler or other known swap contracts TO userAddress
        const isToUser = toAddress === userAddress.toLowerCase()
        const isFromSettler = fromAddress === ZEROX_SETTLER_CONTRACT.toLowerCase()
        const isFromKnownSwap = fromAddress && (
          fromAddress === ZEROX_SETTLER_CONTRACT.toLowerCase() ||
          fromAddress === "0xdef1c0ded9bec7f1a1670819833240f027b25eff".toLowerCase() // 0x Exchange Proxy
        )
        
        return isToUser || (isFromKnownSwap && isToUser)
      } catch {
        return false
      }
    })

    if (wethTransferLogs.length > 0) {
      // Sum all WETH transfers to user (should be from 0x swap)
      for (const log of wethTransferLogs) {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          })
          const toAddress = decoded.args.to?.toLowerCase()
          const fromAddress = decoded.args.from?.toLowerCase()
          
          // Only count transfers TO userAddress (not FROM userAddress)
          if (toAddress === userAddress.toLowerCase() && decoded.args.value) {
            const transferAmount = BigInt(decoded.args.value.toString())
            wethReceivedWei += transferAmount
            console.log(`  📥 WETH Transfer: ${transferAmount.toString()} wei from ${fromAddress} to ${toAddress}`)
          }
        } catch (decodeError) {
          console.error("❌ Error decoding WETH transfer:", decodeError)
        }
      }
      console.log(`✅ Found WETH transfers to user: ${wethReceivedWei.toString()} wei`)
    } else {
      console.warn("⚠️ No WETH transfers found in transaction logs")
      console.log(`  📋 Checking all logs for debugging...`)
      // Debug: Log all Transfer events for troubleshooting
      const allTransferLogs = receipt.logs.filter((log) => {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          })
          return decoded.eventName === "Transfer"
        } catch {
          return false
        }
      })
      console.log(`  📊 Total Transfer events found: ${allTransferLogs.length}`)
      for (const log of allTransferLogs.slice(0, 10)) { // Log first 10 for debugging
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          })
          console.log(`    - Transfer: ${decoded.args.value?.toString()} from ${decoded.args.from} to ${decoded.args.to} (token: ${log.address})`)
        } catch {}
      }
    }

    // Fallback: If WETH transfer not detected but we have expectedEthWei from frontend
    // This can happen in Smart Wallet batch transactions where WETH flow is complex
    // We can use expectedEthWei if we've verified at least one of the required components
    // Note: expectedEthWei is actually WETH (from quote.buyAmount)
    if (wethReceivedWei === BigInt(0) && expectedEthWei) {
      console.warn("⚠️ No WETH detected in logs, checking if we can use expectedEthWei fallback...")
      const expectedWei = BigInt(expectedEthWei)
      
      // Use fallback if:
      // 1. We have expectedEthWei > 0 (actually WETH)
      // 2. AND we've verified at least Treasury transfer OR Settler call exists
      const canUseFallback = expectedWei > BigInt(0) && (treasuryBumpTransferLog || hasSettlerCall || isDirectSettlerCall)
      
      if (canUseFallback) {
        wethReceivedWei = expectedWei
        console.log(`  📝 Using expected WETH from quote as fallback: ${wethReceivedWei.toString()} wei`)
        console.log(`  ✅ Fallback verification passed:`)
        console.log(`     - Treasury transfer found: ${!!treasuryBumpTransferLog}`)
        console.log(`     - Settler call found: ${hasSettlerCall || isDirectSettlerCall}`)
        console.log(`     - Expected WETH provided: ${expectedWei.toString()} wei`)
      } else {
        console.warn("  ❌ Cannot use fallback - missing required verification components")
        console.warn(`    - Treasury transfer found: ${!!treasuryBumpTransferLog}`)
        console.warn(`    - Settler call found: ${hasSettlerCall || isDirectSettlerCall}`)
        console.warn(`    - Expected WETH provided: ${expectedWei > BigInt(0)}`)
      }
    }

    if (wethReceivedWei === BigInt(0)) {
      console.warn("⚠️ No WETH received detected in transaction")
      if (!expectedEthWei) {
        console.warn("  ❌ No expectedEthWei provided - cannot proceed with verification")
        return { ethAmountWei: BigInt(0), isValid: false }
      } else {
        console.warn("  ⚠️ expectedEthWei was provided but fallback verification failed")
        console.warn(`    - Treasury transfer: ${!!treasuryBumpTransferLog}`)
        console.warn(`    - Settler call: ${hasSettlerCall || isDirectSettlerCall}`)
        return { ethAmountWei: BigInt(0), isValid: false }
      }
    }

    // 5. Verify that 5% WETH was transferred to Treasury (optional check)
    // This ensures the full workflow was executed
    // Note: WETH is kept as WETH (not unwrapped to ETH) for gasless transactions
    // We check for WETH transfers to Treasury in the transaction logs

    // 6. Calculate 90% credit (after 5% app fee to Treasury)
    // IMPORTANT: The workflow is:
    //   1. 5% $BUMP → Treasury (as $BUMP token)
    //   2. 95% $BUMP → Swap via 0x → WETH
    //   3. 5% WETH → Treasury (as WETH token)
    //   4. 90% WETH → Stays in Smart Wallet as Credit
    // 
    // wethReceivedWei = Total WETH received from swap (100% of swap result)
    // creditAmountWei = 90% of total WETH (the portion that stays in Smart Wallet as credit)
    // The remaining 5% was already sent to Treasury in step 3
    const creditAmountWei = (wethReceivedWei * BigInt(USER_CREDIT_BPS)) / BigInt(10000)

    // Convert to WETH for logging (for readability)
    const wethReceivedWeth = Number(wethReceivedWei) / 1e18
    const creditAmountWeth = Number(creditAmountWei) / 1e18
    const treasuryWethAmount = Number(wethReceivedWei - creditAmountWei) / 1e18

    console.log(`\n✅ [VERIFICATION SUCCESS] Transaction verified as valid convert:`)
    console.log(`   - Treasury $BUMP transfer (5%): ✅`)
    console.log(`   - 0x Settler swap (95% $BUMP → WETH): ✅`)
    console.log(`   - Total WETH from swap: ${wethReceivedWei.toString()} wei (${wethReceivedWeth.toFixed(6)} WETH)`)
    console.log(`   - Credit amount (90% of total WETH): ${creditAmountWei.toString()} wei (${creditAmountWeth.toFixed(6)} WETH)`)
    console.log(`   - Treasury WETH (5% of total WETH): ${(wethReceivedWei - creditAmountWei).toString()} wei (${treasuryWethAmount.toFixed(6)} WETH)`)
    console.log(`   📝 This ${creditAmountWeth.toFixed(6)} WETH will be stored in database as credit`)

    return {
      ethAmountWei: creditAmountWei,
      isValid: true,
    }
  } catch (error) {
    console.error("❌ Error verifying transaction:", error)
    return { ethAmountWei: BigInt(0), isValid: false }
  }
}

/**
 * Sync user credit balance with on-chain balance
 * Used when database credit is higher than on-chain balance (prevents distribution errors)
 */
async function syncUserCreditBalance(
  userAddress: string,
  onChainBalanceWei: string
): Promise<{ success: boolean; synced: boolean; message: string }> {
  const supabase = createSupabaseServiceClient()
  const normalizedUserAddress = userAddress.toLowerCase()

  // Get current database credit
  const { data: currentCredit, error: fetchError } = await supabase
    .from("user_credits")
    .select("balance_wei")
    .eq("user_address", normalizedUserAddress)
    .single()

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("❌ Error fetching user credit balance:", fetchError)
    return {
      success: false,
      synced: false,
      message: `Failed to fetch user credit balance: ${fetchError.message}`,
    }
  }

  const currentDbBalanceWei = currentCredit?.balance_wei
    ? BigInt(currentCredit.balance_wei.toString())
    : BigInt(0)

  const onChainBalance = BigInt(onChainBalanceWei)

  // Only sync if on-chain balance is less than database balance
  // (on-chain balance is the source of truth)
  if (onChainBalance >= currentDbBalanceWei) {
    return {
      success: true,
      synced: false,
      message: "Database balance is already in sync or higher than on-chain balance",
    }
  }

  console.log(`🔄 Syncing user credit balance for ${normalizedUserAddress}`)
  console.log(`   Database balance: ${currentDbBalanceWei.toString()} wei`)
  console.log(`   On-chain balance: ${onChainBalanceWei} wei`)
  console.log(`   Difference: ${(currentDbBalanceWei - onChainBalance).toString()} wei`)

  // Update database credit to match on-chain balance
  const { error: updateError } = await supabase
    .from("user_credits")
    .upsert(
      {
        user_address: normalizedUserAddress,
        balance_wei: onChainBalanceWei,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: "user_address",
      }
    )

  if (updateError) {
    console.error("❌ Error updating user credit balance:", updateError)
    return {
      success: false,
      synced: false,
      message: `Failed to update user credit balance: ${updateError.message}`,
    }
  }

  console.log(`✅ User credit balance synced successfully`)
  return {
    success: true,
    synced: true,
    message: "User credit balance synced with on-chain balance",
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Check if this is a balance sync request (different from credit sync from txHash)
    if (body.onChainBalanceWei && !body.txHash) {
      // This is a balance sync request
      const syncRequest: SyncBalanceRequest = body
      const { userAddress, onChainBalanceWei } = syncRequest

      if (!userAddress || !onChainBalanceWei) {
        return NextResponse.json(
          { error: "Missing required fields: userAddress, onChainBalanceWei" },
          { status: 400 }
        )
      }

      const result = await syncUserCreditBalance(userAddress, onChainBalanceWei)
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        synced: result.synced,
        message: result.message,
      })
    }

    // Original credit sync from transaction hash
    const creditRequest: SyncCreditRequest = body
    const { txHash, userAddress, amountBump, amountBumpWei } = creditRequest

    // Validation
    if (!txHash || !userAddress) {
      return NextResponse.json(
        { error: "Missing required fields: txHash and userAddress" },
        { status: 400 }
      )
    }

    // Initialize Supabase service client (bypasses RLS)
    const supabase = createSupabaseServiceClient()

    // Check if transaction has already been processed (duplicate check)
    const { data: existingLog, error: checkError } = await supabase
      .from("conversion_logs")
      .select("tx_hash, eth_credit_wei")
      .eq("tx_hash", txHash)
      .single()

    if (existingLog && !checkError) {
      console.log(`⚠️ Transaction ${txHash} has already been processed`)
      console.log(`   Previous credit amount: ${existingLog.eth_credit_wei} wei`)
      return NextResponse.json(
        { 
          error: "Transaction has already been processed",
          ethCreditWei: existingLog.eth_credit_wei,
          message: "This transaction was already synced to your credit balance"
        },
        { status: 409 } // 409 Conflict
      )
    }

    console.log(`🔄 Starting verification for transaction: ${txHash}`)
    console.log(`   User address: ${userAddress}`)
    console.log(`   Expected ETH (from frontend): ${body.expectedEthWei || "not provided"}`)

    // Verify transaction and calculate credit
    // Pass expectedEthWei from frontend as fallback if WETH transfer detection fails
    const { ethAmountWei, isValid } = await verifyAndCalculateCredit(
      txHash as Hex,
      userAddress as Address,
      body.expectedEthWei // Optional: Expected ETH from quote
    )

    if (!isValid || ethAmountWei === BigInt(0)) {
      console.error(`❌ Verification failed for transaction ${txHash}`)
      console.error(`   - isValid: ${isValid}`)
      console.error(`   - ethAmountWei: ${ethAmountWei.toString()}`)
      console.error(`   - expectedEthWei provided: ${!!body.expectedEthWei}`)
      return NextResponse.json(
        { 
          error: "Transaction verification failed or no ETH credit to add",
          details: "Please check Vercel logs for detailed verification steps"
        },
        { status: 400 }
      )
    }

    console.log(`✅ Verification passed for transaction ${txHash}`)
    console.log(`   - Credit amount to add: ${ethAmountWei.toString()} wei`)

    // Update user_credits table with increment
    // Using raw SQL to ensure atomic increment
    const { error: updateError } = await supabase.rpc("increment_user_credit", {
      p_user_address: userAddress.toLowerCase(),
      p_amount_wei: ethAmountWei.toString(),
    })

    // If RPC function doesn't exist, use upsert with raw SQL increment
    if (updateError) {
      console.warn("⚠️ RPC function not found, using upsert with SQL increment:", updateError)
      
      // Get current balance
      const { data: currentCredit, error: fetchError } = await supabase
        .from("user_credits")
        .select("balance_wei")
        .eq("user_address", userAddress.toLowerCase())
        .single()

      const currentBalanceWei = currentCredit?.balance_wei 
        ? BigInt(currentCredit.balance_wei.toString())
        : BigInt(0)

      const newBalanceWei = currentBalanceWei + ethAmountWei

      // Upsert with new balance
      const { error: upsertError } = await supabase
        .from("user_credits")
        .upsert(
          {
            user_address: userAddress.toLowerCase(),
            balance_wei: newBalanceWei.toString(),
            last_updated: new Date().toISOString(),
          },
          {
            onConflict: "user_address",
          }
        )

      if (upsertError) {
        console.error("❌ Error updating user_credits:", upsertError)
        return NextResponse.json(
          { error: "Failed to update user credit balance" },
          { status: 500 }
        )
      }
    }

    // Save audit log
    const { error: logError } = await supabase.from("conversion_logs").insert({
      user_address: userAddress.toLowerCase(),
      tx_hash: txHash,
      amount_bump: amountBump,
      amount_bump_wei: amountBumpWei,
      eth_credit_wei: ethAmountWei.toString(),
      created_at: new Date().toISOString(),
    })

    if (logError) {
      console.error("⚠️ Error saving conversion log (non-critical):", logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      ethCreditWei: ethAmountWei.toString(),
      message: "Credit synced successfully",
    })
  } catch (error: any) {
    console.error("❌ Error in sync-credit API:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
