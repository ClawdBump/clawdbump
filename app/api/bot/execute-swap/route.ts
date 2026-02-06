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
// 0x API v2 uses AllowanceHolder contract for ERC20 token approvals
// The AllowanceHolder address will be returned in the quote response (quote.allowanceTarget)
// Reference: https://0x.org/docs/upgrading/upgrading_to_swap_v2

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

/**
 * API Route: Execute Swap for Bot Smart Account using CDP Server Wallets V2
 * 
 * Optimized for Clanker v4 (Uniswap v4) with thin liquidity:
 * - Higher slippage tolerance (5% initial, 10% retry)
 * - skipValidation: true to handle dynamic fees
 * - enableSlippageProtection: false for Uniswap v4 hooks
 * - Retry mechanism with fallback parameters
 * - CDP Spend Permissions integration
 * - Owner Account transaction execution
 * 
 * CDP V2 Smart Account Flow:
 * 1. Fetch Smart Account address and Owner address from database
 * 2. Check Smart Account balance (must be >= MIN_AMOUNT_USD)
 * 3. Get swap quote from 0x API v2 with optimized parameters for thin liquidity
 * 4. Check/create CDP Spend Permissions
 * 5. Use Owner Account to execute transaction via Smart Account
 * 6. Native gas sponsorship (no Paymaster needed!)
 * 7. Update wallet rotation index
 * 8. Log all activities with request_id for debugging
 */
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

    console.log(`✅ Session found:`)
    console.log(`   User: ${user_address}`)
    console.log(`   Token: ${token_address}`)
    console.log(`   Amount: $${amount_usd}`)
    console.log(`   Current rotation index: ${wallet_rotation_index}`)

    // Step 2: Fetch bot wallets for this user
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

    // Step 3: Select bot wallet based on rotation index
    const botWallet = botWallets[walletIndex]
    
    if (!botWallet) {
      console.error(`❌ Bot wallet at index ${walletIndex} not found`)
      return NextResponse.json(
        { error: `Bot wallet at index ${walletIndex} not found` },
        { status: 404 }
      )
    }

    const smartAccountAddress = botWallet.smart_account_address as Address
    const ownerAddress = botWallet.owner_address as Address

    console.log(`🤖 Selected Bot #${walletIndex + 1}:`)
    console.log(`   Smart Account: ${smartAccountAddress}`)
    console.log(`   Owner Account: ${ownerAddress}`)

    // Step 4: Initialize CDP Client V2
    console.log("🔧 Initializing Coinbase CDP SDK V2...")
    
    const apiKeyId = process.env.CDP_API_KEY_ID
    const apiKeySecret = process.env.CDP_API_KEY_SECRET

    if (!apiKeyId || !apiKeySecret) {
      console.error("❌ Missing CDP credentials")
      return NextResponse.json(
        { error: "CDP credentials not configured" },
        { status: 500 }
      )
    }

    // CDP Client auto-loads from environment variables
    const cdp = new CdpClient()
    console.log(`✅ CDP Client V2 initialized`)

    // Step 5: Check Smart Account balance (Native ETH + WETH) and convert if needed
    console.log(`💰 Checking Smart Account balance (Native ETH + WETH)...`)
    
    // Check on-chain Native ETH balance
    let nativeEthBalance = BigInt(0)
    try {
      nativeEthBalance = await publicClient.getBalance({
        address: smartAccountAddress,
      })
      console.log(`   Native ETH Balance (on-chain): ${formatEther(nativeEthBalance)} ETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check Native ETH balance: ${error.message}`)
    }
    
    // Check on-chain WETH balance
    let onChainWethBalance = BigInt(0)
    try {
      onChainWethBalance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      }) as bigint
      console.log(`   WETH Balance (on-chain): ${formatEther(onChainWethBalance)} WETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check on-chain WETH balance: ${error.message}`)
    }
    
    // Fetch WETH balance from database (bot_wallet_credits) for reference
    // IMPORTANT: Only 1 row per bot_wallet_address, only weth_balance_wei is used
    const { data: creditRecord, error: creditError } = await supabase
      .from("bot_wallet_credits")
      .select("weth_balance_wei")
      .eq("user_address", user_address.toLowerCase())
      .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
      .single()

    // Get WETH balance from database (for reference)
    const dbWethBalanceWei = creditRecord 
      ? BigInt(creditRecord.weth_balance_wei || "0")
      : BigInt(0)

    console.log(`   WETH Balance (from DB): ${formatEther(dbWethBalanceWei)} WETH`)
    
    // CRITICAL: Use database WETH balance as source of truth (prevents bypass)
    // Only WETH from "Distribute Credits" is counted, NOT direct WETH transfers
    // This prevents users from bypassing by sending WETH directly to bot wallets
    let wethBalanceWei = dbWethBalanceWei
    
    // Log on-chain balance for reference (but don't use it for credit calculation)
    if (onChainWethBalance !== dbWethBalanceWei) {
      console.log(`   ⚠️ On-chain balance (${formatEther(onChainWethBalance)}) differs from DB (${formatEther(dbWethBalanceWei)})`)
      console.log(`   → Using DB balance (${formatEther(dbWethBalanceWei)}) to prevent bypass`)
      console.log(`   → On-chain balance includes direct WETH transfers (not counted as credit)`)
    }

    // Fetch ETH price for USD conversion
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const ethPriceUrl = new URL('/api/eth-price', baseUrl).toString()
    const ethPriceResponse = await fetch(ethPriceUrl)
    const { price: ethPriceUsd } = await ethPriceResponse.json()
    
    const balanceInUsd = Number(formatEther(wethBalanceWei)) * ethPriceUsd
    console.log(`   Balance: $${balanceInUsd.toFixed(4)} USD`)

    // Step 6: Calculate swap amount in WETH (moved up to check balance before swap)
    const amountUsdValue = parseFloat(amount_usd)
    const amountEthValue = amountUsdValue / ethPriceUsd
    let amountWei = BigInt(Math.floor(amountEthValue * 1e18))
    
    // CRITICAL: Ensure amountWei is never zero (minimum 1 wei to avoid transaction failures)
    if (amountWei === BigInt(0)) {
      console.warn(`⚠️ Calculated amountWei is 0, using minimum 1 wei instead`)
      amountWei = BigInt(1)
    }

    // CRITICAL: Check on-chain WETH balance before swap execution
    // Transaction requires actual on-chain WETH, not just DB balance
    // If on-chain balance is insufficient, we cannot execute swap even if DB shows balance
    if (onChainWethBalance < amountWei) {
      console.log(`⚠️ Bot #${walletIndex + 1} has insufficient ON-CHAIN WETH balance - Skipping`)
      console.log(`   Required: ${formatEther(amountWei)} WETH`)
      console.log(`   On-chain Available: ${formatEther(onChainWethBalance)} WETH`)
      console.log(`   DB Balance: ${formatEther(dbWethBalanceWei)} WETH`)
      
      // Sync DB balance with on-chain balance if they differ significantly
      if (onChainWethBalance !== dbWethBalanceWei) {
        console.log(`   → Syncing DB balance with on-chain balance...`)
        try {
          await supabase
            .from("bot_wallet_credits")
            .update({ weth_balance_wei: onChainWethBalance.toString() })
            .eq("user_address", user_address.toLowerCase())
            .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
          console.log(`   ✅ DB balance synced to on-chain balance`)
        } catch (syncError: any) {
          console.warn(`   ⚠️ Failed to sync DB balance: ${syncError.message}`)
        }
      }
      
      // Log insufficient balance
      await supabase.from("bot_logs").insert({
        user_address: user_address.toLowerCase(),
        bot_wallet_address: smartAccountAddress.toLowerCase(),
        token_address: token_address,
        amount_wei: onChainWethBalance.toString(),
        action: "swap_skipped",
        message: `[System] Bot #${walletIndex + 1} has insufficient ON-CHAIN WETH balance (${formatEther(onChainWethBalance)} WETH < ${formatEther(amountWei)} WETH required).`,
        status: "failed",
        created_at: new Date().toISOString(),
      })

      // CRITICAL: Check if ALL wallets are depleted (insufficient ON-CHAIN balance for swap)
      // Check both DB balance and on-chain balance for each wallet
      let allDepleted = true
      for (let i = 0; i < botWallets.length; i++) {
        const w = botWallets[i]
        
        // Check DB balance
        const { data: wCredit } = await supabase
          .from("bot_wallet_credits")
          .select("weth_balance_wei")
          .eq("user_address", user_address.toLowerCase())
          .eq("bot_wallet_address", w.smart_account_address.toLowerCase())
          .single()
        
        const wDbBalance = wCredit 
          ? BigInt(wCredit.weth_balance_wei || "0")
          : BigInt(0)
        
        // Check on-chain balance
        let wOnChainBalance = BigInt(0)
        try {
          wOnChainBalance = await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: "balanceOf",
            args: [w.smart_account_address],
          }) as bigint
        } catch (error: any) {
          console.warn(`   ⚠️ Failed to check on-chain balance for wallet ${i + 1}: ${error.message}`)
        }
        
        // Use the minimum of DB and on-chain balance (most conservative)
        const wEffectiveBalance = wOnChainBalance < wDbBalance ? wOnChainBalance : wDbBalance
        
        // Check if wallet has enough balance for at least one swap
        if (wEffectiveBalance >= amountWei) {
          allDepleted = false
          break
        }
      }

      if (allDepleted) {
        console.log("❌ All 5 bot wallets depleted (insufficient ON-CHAIN WETH balance for swap) - Stopping session automatically")
        
        await supabase
          .from("bot_sessions")
          .update({ 
            status: "stopped",
            stopped_at: new Date().toISOString()
          })
          .eq("id", sessionId)

        await supabase.from("bot_logs").insert({
          user_address: user_address.toLowerCase(),
          bot_wallet_address: smartAccountAddress.toLowerCase(),
          token_address: token_address,
          amount_wei: "0",
          action: "session_stopped",
          message: `[System] All 5 bot wallets have insufficient ON-CHAIN WETH balance for swap. Bumping session stopped automatically.`,
          status: "success",
          created_at: new Date().toISOString(),
        })

        return NextResponse.json({
          message: "All bot wallets depleted - Session stopped automatically",
          allDepleted: true,
          stopped: true,
        })
      }

      // Move to next wallet (some wallets still have sufficient balance)
      const nextIndex = (wallet_rotation_index + 1) % 5
      await supabase
        .from("bot_sessions")
        .update({ wallet_rotation_index: nextIndex })
        .eq("id", sessionId)

      return NextResponse.json({
        message: "Bot wallet has insufficient ON-CHAIN WETH balance - Skipped",
        skipped: true,
        nextIndex,
      })
    }

    // Also check DB balance for credit tracking (but on-chain check above is the critical one)
    if (wethBalanceWei < amountWei) {
      console.log(`⚠️ Bot #${walletIndex + 1} has insufficient DB WETH balance - But on-chain balance is sufficient`)
      console.log(`   DB Balance: ${formatEther(wethBalanceWei)} WETH`)
      console.log(`   On-chain Balance: ${formatEther(onChainWethBalance)} WETH`)
      console.log(`   → Proceeding with swap using on-chain balance`)
      
      // Update DB balance to match on-chain balance
      try {
        await supabase
          .from("bot_wallet_credits")
          .update({ weth_balance_wei: onChainWethBalance.toString() })
          .eq("user_address", user_address.toLowerCase())
          .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
        console.log(`   ✅ DB balance updated to match on-chain balance`)
      } catch (syncError: any) {
        console.warn(`   ⚠️ Failed to sync DB balance: ${syncError.message}`)
      }
      
      // Update wethBalanceWei to use on-chain balance for remaining calculations
      wethBalanceWei = onChainWethBalance
    }

    // Step 6 calculation already done above (line 236-245)
    // amountWei is already calculated
    
    // CRITICAL: Log amountWei for verification
    console.log(`💱 Swap Parameters:`)
    console.log(`   Amount: $${amountUsdValue} USD`)
    console.log(`   Amount: ${formatEther(amountWei)} ETH`)
    console.log(`   Amount (wei): ${amountWei.toString()}`)
    console.log(`   Target Token: ${token_address}`)
    console.log(`   Current WETH Balance: ${formatEther(wethBalanceWei)} WETH`)
    
    // Step 6.5: Check if WETH balance is sufficient, if not, try to convert Native ETH to WETH
    // NO MINIMUM AMOUNT VALIDATION - bot can swap any amount (even 1 wei)
    if (wethBalanceWei < amountWei) {
      console.log(`⚠️ Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)})`)
      console.log(`   → Checking if we can convert Native ETH to WETH...`)
      
      // Calculate how much WETH we need
      const wethNeeded = amountWei - wethBalanceWei
      console.log(`   → WETH needed: ${formatEther(wethNeeded)} WETH`)
      console.log(`   → Native ETH available: ${formatEther(nativeEthBalance)} ETH`)
      
      // Check if we have enough Native ETH to convert
      if (nativeEthBalance >= wethNeeded) {
        console.log(`   → Converting ${formatEther(wethNeeded)} Native ETH to WETH...`)
        
        try {
          // Get Owner Account and Smart Account for CDP SDK
          const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
          if (!ownerAccount) {
            throw new Error("Failed to get Owner Account from CDP")
          }

          const smartAccount = await cdp.evm.getSmartAccount({ 
            owner: ownerAccount,
            address: smartAccountAddress 
          })
          if (!smartAccount) {
            throw new Error("Failed to get Smart Account from CDP")
          }

          // Encode WETH deposit function call (WETH.deposit())
          const depositData = encodeFunctionData({
            abi: WETH_ABI,
            functionName: "deposit",
          })

          // Execute deposit transaction using Smart Account (gasless)
          const depositCall = {
            to: WETH_ADDRESS,
            data: depositData,
            value: wethNeeded, // Send Native ETH to WETH contract
          }

          console.log(`   → Executing WETH deposit transaction (gasless)...`)
          const depositUserOpHash = await (smartAccount as any).sendUserOperation({
            network: "base",
            calls: [depositCall],
            isSponsored: true, // Gasless transaction
          })

          const depositUserOpHashStr = typeof depositUserOpHash === 'string' 
            ? depositUserOpHash 
            : (depositUserOpHash?.hash || depositUserOpHash?.userOpHash || String(depositUserOpHash))

          console.log(`   → WETH deposit User Operation submitted: ${depositUserOpHashStr}`)

          // Wait for deposit confirmation
          if (typeof (smartAccount as any).waitForUserOperation === 'function') {
            await (smartAccount as any).waitForUserOperation({
              userOpHash: depositUserOpHashStr,
              network: "base",
            })
            console.log(`   ✅ ${formatEther(wethNeeded)} Native ETH successfully converted to WETH!`)
          } else {
            // Fallback: wait using public client
            await publicClient.waitForTransactionReceipt({
              hash: depositUserOpHashStr as `0x${string}`,
              confirmations: 1,
              timeout: 60000,
            })
            console.log(`   ✅ ${formatEther(wethNeeded)} Native ETH successfully converted to WETH! (via public client)`)
          }

          // Update WETH balance after conversion
          const newWethBalance = await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: "balanceOf",
            args: [smartAccountAddress],
          }) as bigint
          
          wethBalanceWei = newWethBalance
          console.log(`   → New WETH balance: ${formatEther(wethBalanceWei)} WETH`)

          // Update database with new WETH balance
          try {
            await supabase
              .from("bot_wallet_credits")
              .update({ weth_balance_wei: wethBalanceWei.toString() })
              .eq("user_address", user_address.toLowerCase())
              .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
          } catch (err: any) {
            console.warn("Failed to update DB balance:", err)
          }

          // Log conversion
          await supabase.from("bot_logs").insert({
            user_address: user_address.toLowerCase(),
            bot_wallet_address: smartAccountAddress.toLowerCase(),
            token_address: token_address,
            amount_wei: wethNeeded.toString(),
            action: "eth_to_weth_conversion",
            message: `[Bot #${walletIndex + 1}] Converted ${formatEther(wethNeeded)} Native ETH to WETH before swap`,
            status: "success",
            tx_hash: depositUserOpHashStr,
            created_at: new Date().toISOString(),
          })

        } catch (convertError: any) {
          console.error(`   ❌ Failed to convert Native ETH to WETH:`, convertError.message)
          
          // Log error but continue - maybe we can still proceed with available WETH
          await supabase.from("bot_logs").insert({
            user_address: user_address.toLowerCase(),
            bot_wallet_address: smartAccountAddress.toLowerCase(),
            token_address: token_address,
            amount_wei: wethNeeded.toString(),
            action: "eth_to_weth_conversion_failed",
            message: `[Bot #${walletIndex + 1}] Failed to convert Native ETH to WETH: ${convertError.message}`,
            status: "error",
            error_details: { error: convertError.message },
            created_at: new Date().toISOString(),
          })

          // If conversion failed, check if all wallets are depleted before skipping
          console.log(`   → Conversion failed, checking if all wallets are depleted...`)
          
          // CRITICAL: Check if ALL wallets are depleted (insufficient balance for swap)
          let allDepletedAfterConvertFail = true
          for (let i = 0; i < botWallets.length; i++) {
            const w = botWallets[i]
            const { data: wCredit } = await supabase
              .from("bot_wallet_credits")
              .select("weth_balance_wei")
              .eq("user_address", user_address.toLowerCase())
              .eq("bot_wallet_address", w.smart_account_address.toLowerCase())
              .single()
            
            const wWethBalance = wCredit 
              ? BigInt(wCredit.weth_balance_wei || "0")
              : BigInt(0)
            
            // Check if wallet has enough balance for at least one swap
            if (wWethBalance >= amountWei) {
              allDepletedAfterConvertFail = false
              break
            }
          }

          if (allDepletedAfterConvertFail) {
            console.log("❌ All bot wallets depleted after conversion failed - Stopping session automatically")
            
            await supabase
              .from("bot_sessions")
              .update({ 
                status: "stopped",
                stopped_at: new Date().toISOString()
              })
              .eq("id", sessionId)

            await supabase.from("bot_logs").insert({
              user_address: user_address.toLowerCase(),
              bot_wallet_address: smartAccountAddress.toLowerCase(),
              token_address: token_address,
              amount_wei: "0",
              action: "session_stopped",
              message: `[System] All 5 bot wallets have insufficient WETH balance for swap (conversion failed). Bumping session stopped automatically.`,
              status: "success",
              created_at: new Date().toISOString(),
            })

            return NextResponse.json({
              message: "All bot wallets depleted - Session stopped automatically",
              allDepleted: true,
              stopped: true,
            })
          }
          
          await supabase.from("bot_logs").insert({
            user_address: user_address.toLowerCase(),
            bot_wallet_address: smartAccountAddress.toLowerCase(),
            token_address: token_address,
            amount_wei: amountWei.toString(),
            action: "swap_skipped",
            message: `[System] Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)}). Conversion failed.`,
            status: "failed",
            created_at: new Date().toISOString(),
          })

          // Move to next wallet (some wallets still have sufficient balance)
          const nextIndex = (wallet_rotation_index + 1) % 5
          await supabase
            .from("bot_sessions")
            .update({ wallet_rotation_index: nextIndex })
            .eq("id", sessionId)

          return NextResponse.json({
            message: "Bot wallet WETH balance insufficient - Conversion failed - Skipped",
            skipped: true,
            nextIndex,
          })
        }
      } else {
        // Not enough Native ETH to convert
        console.log(`   → Not enough Native ETH to convert (need ${formatEther(wethNeeded)}, have ${formatEther(nativeEthBalance)})`)
        console.log(`   → Checking if all wallets are depleted...`)
        
        // CRITICAL: Check if ALL wallets are depleted (insufficient balance for swap)
        let allDepletedNoEth = true
        for (let i = 0; i < botWallets.length; i++) {
          const w = botWallets[i]
          const { data: wCredit } = await supabase
            .from("bot_wallet_credits")
            .select("weth_balance_wei")
            .eq("user_address", user_address.toLowerCase())
            .eq("bot_wallet_address", w.smart_account_address.toLowerCase())
            .single()
          
          const wWethBalance = wCredit 
            ? BigInt(wCredit.weth_balance_wei || "0")
            : BigInt(0)
          
          // Check if wallet has enough balance for at least one swap
          if (wWethBalance >= amountWei) {
            allDepletedNoEth = false
            break
          }
        }

        if (allDepletedNoEth) {
          console.log("❌ All bot wallets depleted (not enough Native ETH to convert) - Stopping session automatically")
          
          await supabase
            .from("bot_sessions")
            .update({ 
              status: "stopped",
              stopped_at: new Date().toISOString()
            })
            .eq("id", sessionId)

        await supabase.from("bot_logs").insert({
          user_address: user_address.toLowerCase(),
          bot_wallet_address: smartAccountAddress.toLowerCase(),
          token_address: token_address,
          amount_wei: "0",
          action: "session_stopped",
            message: `[System] All 5 bot wallets have insufficient WETH balance for swap (not enough Native ETH to convert). Bumping session stopped automatically.`,
            status: "success",
            created_at: new Date().toISOString(),
          })

          return NextResponse.json({
            message: "All bot wallets depleted - Session stopped automatically",
            allDepleted: true,
            stopped: true,
          })
        }
        
        await supabase.from("bot_logs").insert({
          user_address: user_address.toLowerCase(),
          bot_wallet_address: smartAccountAddress.toLowerCase(),
          token_address: token_address,
          amount_wei: amountWei.toString(),
          action: "swap_skipped",
          message: `[System] Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)}). Not enough Native ETH to convert.`,
          status: "failed",
          created_at: new Date().toISOString(),
        })

        // Move to next wallet (some wallets still have sufficient balance)
        const nextIndex = (wallet_rotation_index + 1) % 5
        await supabase
          .from("bot_sessions")
          .update({ wallet_rotation_index: nextIndex })
          .eq("id", sessionId)

        return NextResponse.json({
          message: "Bot wallet WETH balance insufficient - Not enough Native ETH to convert - Skipped",
          skipped: true,
          nextIndex,
        })
      }
    } else {
      console.log(`   ✅ WETH balance sufficient: ${formatEther(wethBalanceWei)} >= ${formatEther(amountWei)}`)
    }

    // Step 7: Get swap quote from 0x API v2 with optimized parameters for Clanker v4
    console.log(`📊 Fetching swap quote from 0x API v2 (optimized for Uniswap v4 / Clanker)...`)
    
    const zeroXApiKey = process.env.ZEROX_API_KEY
    if (!zeroXApiKey) {
      console.error("❌ 0x API key not configured")
      return NextResponse.json(
        { error: "0x API key not configured" },
        { status: 500 }
      )
    }

    // Validate token address before making API call
    if (!isAddress(token_address)) {
      console.error(`❌ Invalid token address: ${token_address}`)
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 }
      )
    }

    /**
     * 0x API v2 Quote with Retry Logic for WETH swaps (ERC20 token)
     * 
     * Based on: https://0x.org/docs/upgrading/upgrading_to_swap_v2
     * 
     * Key Changes for WETH (ERC20) using AllowanceHolder:
     * - Endpoint: /swap/allowance-holder/quote (for ERC20 tokens like WETH)
     * - sellToken: WETH contract address (0x4200000000000000000000000000000000000006)
     * - buyToken: Target token address
     * - Parameter: slippageBps (basis points: 5% = 500, 10% = 1000)
     * - Parameter: taker (changed from takerAddress in v1)
     * - Response: quote.transaction.to, quote.transaction.data, quote.transaction.value (should be 0 for ERC20)
     * - Response: quote.allowanceTarget (AllowanceHolder contract address for approval)
     * - Transaction value: Always 0 for ERC20 swaps (WETH is not native ETH)
     * 
     * Attempt 1: 5% slippage (500 bps)
     * Attempt 2: 10% slippage (1000 bps) for thin liquidity tokens
     */
    let quote: any = null
    let quoteError: any = null
    let requestId: string | null = null
    let attempt = 1
    const maxAttempts = 2

    while (attempt <= maxAttempts && !quote) {
      console.log(`\n🔄 Attempt ${attempt}/${maxAttempts} - Getting 0x API v2 quote...`)
      
      // Build quote parameters based on attempt
      // Using WETH as sellToken (ERC20 token)
    const quoteParams = new URLSearchParams({
      chainId: "8453", // Base Mainnet
        sellToken: WETH_ADDRESS.toLowerCase(), // WETH contract address
        buyToken: token_address.toLowerCase(), // Target token (ensure lowercase)
        sellAmount: amountWei.toString(), // Amount in wei
        taker: smartAccountAddress.toLowerCase(), // Smart Account holds the WETH
        slippageBps: attempt === 1 ? "500" : "1000", // 5% = 500 bps, 10% = 1000 bps
      })

      // Use swap/allowance-holder/quote endpoint for ERC20 token swaps (WETH)
      // Reference: https://0x.org/docs/upgrading/upgrading_to_swap_v2
      // AllowanceHolder is ideal for single-signature use cases and ERC20 tokens
      const quoteUrlObj = new URL('https://api.0x.org/swap/allowance-holder/quote')
      quoteParams.forEach((value, key) => {
        quoteUrlObj.searchParams.set(key, value)
      })
      const quoteUrl = quoteUrlObj.toString()
      console.log(`   Endpoint: /swap/allowance-holder/quote (WETH → Token)`)
      console.log(`   URL: ${quoteUrl}`)
      console.log(`   Sell Token: WETH (${WETH_ADDRESS})`)
      console.log(`   Buy Token: ${token_address}`)
      console.log(`   Slippage: ${attempt === 1 ? "5%" : "10%"} (${attempt === 1 ? "500" : "1000"} bps)`)

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          "0x-api-key": zeroXApiKey,
          "0x-version": "v2", // Explicitly specify v2
          "Accept": "application/json",
        },
      })

    if (!quoteResponse.ok) {
        try {
          quoteError = await quoteResponse.json()
          requestId = quoteError.request_id || quoteError.requestId || null
        } catch (e) {
          quoteError = { message: quoteResponse.statusText }
        }
        
        console.warn(`⚠️ Attempt ${attempt} failed:`, quoteError)
        
        // If "no Route matched" and we have more attempts, continue to retry
        if (quoteError.message && 
            (quoteError.message.i
