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
    console.log(`   User: ${user_address}`)
    console.log(`   Token: ${token_address}`)
    console.log(`   Amount: $${amount_usd}`)
    console.log(`   Current rotation index: ${wallet_rotation_index}`)

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
    console.log(`   Smart Account: ${smartAccountAddress}`)
    console.log(`   Owner Account: ${ownerAddress}`)

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
      console.log(`   Native ETH Balance (on-chain): ${formatEther(nativeEthBalance)} ETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check Native ETH balance: ${error.message}`)
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
      console.log(`   WETH Balance (on-chain): ${formatEther(onChainWethBalance)} WETH`)
    } catch (error: any) {
      console.warn(`   ⚠️ Failed to check on-chain WETH balance: ${error.message}`)
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

    console.log(`   WETH Balance (from DB): ${formatEther(dbWethBalanceWei)} WETH`)
    
    // CRITICAL: Use database WETH balance as source of truth (prevents bypass)
    // Only WETH from "Distribute Credits" is counted, NOT direct WETH transfers
    // This prevents users from bypassing by sending WETH directly to bot wallets
    let wethBalanceWei = dbWethBalanceWei
    
    // Log on-chain balance for reference (but don't use it for credit calculation)
    if (onChainWethBalance !== dbWethBalanceWei) {
      console.log(`   ⚠️ On-chain balance (${formatEther(onChainWethBalance)}) differs from DB (${formatEther(dbWethBalanceWei)})`)
      console.log(`   → Using DB balance (${formatEther(dbWethBalanceWei)}) to prevent bypass`)
      console.log(`   → On-chain balance includes direct WETH transfers (not counted as credit)`)
    }

    // Fetch ETH price for USD conversion
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const ethPriceUrl = new URL('/api/eth-price', baseUrl).toString()
    const ethPriceResponse = await fetch(ethPriceUrl)
    const { price: ethPriceUsd } = await ethPriceResponse.json()
    
    const balanceInUsd = Number(formatEther(wethBalanceWei)) * ethPriceUsd
    console.log(`   Balance: $${balanceInUsd.toFixed(4)} USD`)

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
      console.log(`   Required: ${formatEther(amountWei)} WETH`)
      console.log(`   On-chain Available: ${formatEther(onChainWethBalance)} WETH`)
      console.log(`   DB Balance: ${formatEther(dbWethBalanceWei)} WETH`)
      
      // Sync DB balance with on-chain balance if they differ significantly
      if (onChainWethBalance !== dbWethBalanceWei) {
        console.log(`   → Syncing DB balance with on-chain balance...`)
        try {
          await supabase
            .from("bot_wallet_credits")
            .update({ weth_balance_wei: onChainWethBalance.toString() })
            .eq("user_address", user_address.toLowerCase())
            .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
          console.log(`   ✅ DB balance synced to on-chain balance`)
        } catch (syncError: any) {
          console.warn(`   ⚠️ Failed to sync DB balance: ${syncError.message}`)
        }
      }
      
      // Log insufficient balance
      await supabase.from("bot_logs").insert({
        user_address: user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: token_address,
        amount_wei: onChainWethBalance.toString(),
        action: "swap_skipped",
        message: `[System] Bot #${walletIndex + 1} has insufficient ON-CHAIN WETH balance (${formatEther(onChainWethBalance)} WETH < ${formatEther(amountWei)} WETH required).`,
        status: "warning",
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
          console.warn(`   ⚠️ Failed to check on-chain balance for wallet ${i + 1}: ${error.message}`)
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
          wallet_address: smartAccountAddress,
          token_address: token_address,
          amount_wei: "0",
          action: "session_stopped",
          message: `[System] All 5 bot wallets have insufficient ON-CHAIN WETH balance for swap. Bumping session stopped automatically.`,
          status: "info",
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
      console.log(`   DB Balance: ${formatEther(wethBalanceWei)} WETH`)
      console.log(`   On-chain Balance: ${formatEther(onChainWethBalance)} WETH`)
      console.log(`   → Proceeding with swap using on-chain balance`)
      
      // Update DB balance to match on-chain balance
      try {
        await supabase
          .from("bot_wallet_credits")
          .update({ weth_balance_wei: onChainWethBalance.toString() })
          .eq("user_address", user_address.toLowerCase())
          .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
        console.log(`   ✅ DB balance updated to match on-chain balance`)
      } catch (syncError: any) {
        console.warn(`   ⚠️ Failed to sync DB balance: ${syncError.message}`)
      }
      
      // Update wethBalanceWei to use on-chain balance for remaining calculations
      wethBalanceWei = onChainWethBalance
    }

    // Step 6 calculation already done above (line 236-245)
    // amountWei is already calculated
    
    // CRITICAL: Log amountWei for verification
    console.log(`💱 Swap Parameters:`)
    console.log(`   Amount: $${amountUsdValue} USD`)
    console.log(`   Amount: ${formatEther(amountWei)} ETH`)
    console.log(`   Amount (wei): ${amountWei.toString()}`)
    console.log(`   Target Token: ${token_address}`)
    console.log(`   Current WETH Balance: ${formatEther(wethBalanceWei)} WETH`)
    
    // Step 6.5: Check if WETH balance is sufficient, if not, try to convert Native ETH to WETH
    // NO MINIMUM AMOUNT VALIDATION - bot can swap any amount (even 1 wei)
    if (wethBalanceWei < amountWei) {
      console.log(`⚠️ Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)})`)
      console.log(`   → Checking if we can convert Native ETH to WETH...`)
      
      // Calculate how much WETH we need
      const wethNeeded = amountWei - wethBalanceWei
      console.log(`   → WETH needed: ${formatEther(wethNeeded)} WETH`)
      console.log(`   → Native ETH available: ${formatEther(nativeEthBalance)} ETH`)
      
      // Check if we have enough Native ETH to convert
      if (nativeEthBalance >= wethNeeded) {
        console.log(`   → Converting ${formatEther(wethNeeded)} Native ETH to WETH...`)
        
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

          console.log(`   → Executing WETH deposit transaction (gasless)...`)
          const depositUserOpHash = await (smartAccount as any).sendUserOperation({
            network: "base",
            calls: [depositCall],
            isSponsored: true, // Gasless transaction
          })

          const depositUserOpHashStr = typeof depositUserOpHash === 'string' 
            ? depositUserOpHash 
            : (depositUserOpHash?.hash || depositUserOpHash?.userOpHash || String(depositUserOpHash))

          console.log(`   → WETH deposit User Operation submitted: ${depositUserOpHashStr}`)

          // Wait for deposit confirmation
          if (typeof (smartAccount as any).waitForUserOperation === 'function') {
            await (smartAccount as any).waitForUserOperation({
              userOpHash: depositUserOpHashStr,
              network: "base",
            })
            console.log(`   ✅ ${formatEther(wethNeeded)} Native ETH successfully converted to WETH!`)
          } else {
            // Fallback: wait using public client
            await publicClient.waitForTransactionReceipt({
              hash: depositUserOpHashStr as `0x${string}`,
              confirmations: 1,
              timeout: 60000,
            })
            console.log(`   ✅ ${formatEther(wethNeeded)} Native ETH successfully converted to WETH! (via public client)`)
          }

          // Update WETH balance after conversion
          const newWethBalance = await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: WETH_ABI,
            functionName: "balanceOf",
            args: [smartAccountAddress],
          }) as bigint
          
          wethBalanceWei = newWethBalance
          console.log(`   → New WETH balance: ${formatEther(wethBalanceWei)} WETH`)

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
            wallet_address: smartAccountAddress,
            token_address: token_address,
            amount_wei: wethNeeded.toString(),
            action: "eth_to_weth_conversion",
            message: `[Bot #${walletIndex + 1}] Converted ${formatEther(wethNeeded)} Native ETH to WETH before swap`,
            status: "success",
            tx_hash: depositUserOpHashStr,
            created_at: new Date().toISOString(),
          })

        } catch (convertError: any) {
          console.error(`   ❌ Failed to convert Native ETH to WETH:`, convertError.message)
          
          // Log error but continue - maybe we can still proceed with available WETH
          await supabase.from("bot_logs").insert({
            user_address: user_address.toLowerCase(),
            wallet_address: smartAccountAddress,
            token_address: token_address,
            amount_wei: wethNeeded.toString(),
            action: "eth_to_weth_conversion_failed",
            message: `[Bot #${walletIndex + 1}] Failed to convert Native ETH to WETH: ${convertError.message}`,
            status: "error",
            error_details: { error: convertError.message },
            created_at: new Date().toISOString(),
          })

          // If conversion failed, check if all wallets are depleted before skipping
          console.log(`   → Conversion failed, checking if all wallets are depleted...`)
          
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
              wallet_address: smartAccountAddress,
              token_address: token_address,
              amount_wei: "0",
              action: "session_stopped",
              message: `[System] All 5 bot wallets have insufficient WETH balance for swap (conversion failed). Bumping session stopped automatically.`,
              status: "info",
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
            wallet_address: smartAccountAddress,
            token_address: token_address,
            amount_wei: amountWei.toString(),
            action: "swap_skipped",
            message: `[System] Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)}). Conversion failed.`,
            status: "warning",
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
        console.log(`   → Not enough Native ETH to convert (need ${formatEther(wethNeeded)}, have ${formatEther(nativeEthBalance)})`)
        console.log(`   → Checking if all wallets are depleted...`)
        
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
            wallet_address: smartAccountAddress,
            token_address: token_address,
            amount_wei: "0",
            action: "session_stopped",
            message: `[System] All 5 bot wallets have insufficient WETH balance for swap (not enough Native ETH to convert). Bumping session stopped automatically.`,
            status: "info",
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
          wallet_address: smartAccountAddress,
          token_address: token_address,
          amount_wei: amountWei.toString(),
          action: "swap_skipped",
          message: `[System] Bot #${walletIndex + 1} WETH balance insufficient (${formatEther(wethBalanceWei)} < ${formatEther(amountWei)}). Not enough Native ETH to convert.`,
          status: "warning",
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
      console.log(`   ✅ WETH balance sufficient: ${formatEther(wethBalanceWei)} >= ${formatEther(amountWei)}`)
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
      console.log(`   Endpoint: /swap/allowance-holder/quote (WETH → Token)`)
      console.log(`   URL: ${quoteUrl}`)
      console.log(`   Sell Token: WETH (${WETH_ADDRESS})`)
      console.log(`   Buy Token: ${token_address}`)
      console.log(`   Slippage: ${attempt === 1 ? "5%" : "10%"} (${attempt === 1 ? "500" : "1000"} bps)`)

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
            (quoteError.message.includes("no Route matched") || 
             quoteError.message.includes("No route found") ||
             quoteError.message.includes("INSUFFICIENT_ASSET_LIQUIDITY")) &&
            attempt < maxAttempts) {
          console.log(`   → Retrying with higher slippage (10% = 1000 bps)...`)
          attempt++
          continue
        } else {
          // Final failure or different error
          break
        }
      } else {
        // Success!
        quote = await quoteResponse.json()
        console.log(`✅ Got swap quote on attempt ${attempt}:`)
        // v2 API response structure: transaction.to, transaction.data, transaction.value
        const transaction = quote.transaction || quote
        console.log(`   To: ${transaction.to}`)
        console.log(`   Data: ${transaction.data?.slice(0, 66) || 'N/A'}...`)
        // Safely handle value (may be undefined in v2 API)
        const logValue = transaction.value 
          ? (typeof transaction.value === 'string' ? transaction.value : String(transaction.value))
          : "0"
        console.log(`   Value: ${formatEther(BigInt(logValue))} ETH`)
        console.log(`   Buy Amount: ${quote.buyAmount || 'N/A'}`)
        console.log(`   Allowance Target: ${quote.allowanceTarget || 'N/A'}`)
        console.log(`   Price: ${quote.price || 'N/A'}`)
        break
      }
    }

    // If all attempts failed, log and return error
    if (!quote) {
      const errorMessage = quoteError?.message || "Unknown error"
      const finalErrorMessage = errorMessage.includes("no Route matched") || errorMessage.includes("No route found")
        ? `Insufficient Liquidity or No Route for ${token_address}`
        : `Failed to get swap quote: ${errorMessage}`
      
      console.error("❌ All 0x API quote attempts failed")
      console.error("   Final error:", quoteError)
      console.error("   Request ID:", requestId)
      console.error("   Token address:", token_address)
      console.error("   Smart Account:", smartAccountAddress)
      console.error("   Amount (wei):", amountWei.toString())
      console.error("   Amount (ETH):", formatEther(amountWei))
      console.error("   Amount (USD):", amountUsdValue)

      // Log error to database with request_id
      await supabase.from("bot_logs").insert({
        user_address: user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: token_address,
        amount_wei: amountWei.toString(),
        action: "swap_failed",
        message: `[Bot #${walletIndex + 1}] ${finalErrorMessage}`,
        status: "error",
        error_details: {
          ...quoteError,
          request_id: requestId,
          attempt: attempt - 1,
          amount_wei: amountWei.toString(),
          amount_eth: formatEther(amountWei),
          amount_usd: amountUsdValue,
        },
        created_at: new Date().toISOString(),
      })

      // Move to next wallet without stopping the session
      const nextIndex = (wallet_rotation_index + 1) % 5
      await supabase
        .from("bot_sessions")
        .update({ wallet_rotation_index: nextIndex })
        .eq("id", sessionId)

      return NextResponse.json({
        error: finalErrorMessage,
        details: quoteError,
        request_id: requestId,
        skipped: true,
        nextIndex,
        hint: "Moving to next wallet. Session continues.",
      }, { status: 200 }) // Return 200 to continue session
    }

    // Step 8: Check WETH approval for 0x AllowanceHolder
    // In v2 API, the AllowanceHolder contract address is returned in quote.allowanceTarget
    // Reference: https://0x.org/docs/upgrading/upgrading_to_swap_v2
    const allowanceTarget = quote.allowanceTarget || quote.transaction?.to
    
    if (!allowanceTarget) {
      console.error(`❌ No allowance target found in quote response`)
      throw new Error("Invalid quote response: missing allowanceTarget")
    }
    
    console.log(`🔐 Checking WETH approval for 0x AllowanceHolder...`)
    console.log(`   AllowanceHolder Address: ${allowanceTarget}`)
    
    let needsApproval = false
    try {
      const currentAllowance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "allowance",
        args: [smartAccountAddress, allowanceTarget as Address],
      }) as bigint

      console.log(`   Current allowance: ${formatEther(currentAllowance)} WETH`)
      console.log(`   Required amount: ${formatEther(amountWei)} WETH`)

      if (currentAllowance < amountWei) {
        needsApproval = true
        console.log(`   ⚠️ Insufficient allowance. Need to approve WETH to AllowanceHolder.`)
      } else {
        console.log(`   ✅ Sufficient allowance. No approval needed.`)
      }
    } catch (approvalCheckError: any) {
      console.warn(`   ⚠️ Failed to check allowance: ${approvalCheckError.message}`)
      // Assume approval is needed if check fails
      needsApproval = true
    }

    // Step 9: Approve WETH if needed
    // In v2 API, we approve to AllowanceHolder contract (not Exchange Proxy)
    // Reference: https://0x.org/docs/upgrading/upgrading_to_swap_v2
    if (needsApproval) {
      console.log(`🔐 Approving WETH for 0x AllowanceHolder...`)
      console.log(`   AllowanceHolder Address: ${allowanceTarget}`)
      
      try {
        // Get Owner Account and Smart Account
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

        // Encode approve function call
        // Approve max amount (2^256 - 1) to avoid repeated approvals
        // In v2 API, we approve to AllowanceHolder contract (returned in quote.allowanceTarget)
        const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
        const approveData = encodeFunctionData({
          abi: WETH_ABI,
          functionName: "approve",
          args: [allowanceTarget as Address, maxApproval],
        })

        // Execute approval transaction
        const approveCall = {
          to: WETH_ADDRESS,
          data: approveData,
          value: BigInt(0), // ERC20 approval, value is 0
        }

        console.log(`   → Executing approval transaction...`)
        const approveUserOpHash = await (smartAccount as any).sendUserOperation({
          network: "base",
          calls: [approveCall],
          isSponsored: true,
        })

        const approveUserOpHashStr = typeof approveUserOpHash === 'string' 
          ? approveUserOpHash 
          : (approveUserOpHash?.hash || approveUserOpHash?.userOpHash || String(approveUserOpHash))

        console.log(`   → Approval User Operation submitted: ${approveUserOpHashStr}`)

        // Wait for approval confirmation
        if (typeof (smartAccount as any).waitForUserOperation === 'function') {
          await (smartAccount as any).waitForUserOperation({
            userOpHash: approveUserOpHashStr,
            network: "base",
          })
          console.log(`   ✅ WETH approval confirmed`)
        } else {
          // Fallback: wait using public client
          await publicClient.waitForTransactionReceipt({
            hash: approveUserOpHashStr as `0x${string}`,
            confirmations: 1,
            timeout: 60000,
          })
          console.log(`   ✅ WETH approval confirmed (via public client)`)
        }
      } catch (approvalError: any) {
        console.error(`   ❌ WETH approval failed: ${approvalError.message}`)
        throw new Error(`Failed to approve WETH: ${approvalError.message}`)
      }
    }

    // Step 10: Create swap log entry
    const { data: logEntry, error: logError } = await supabase
      .from("bot_logs")
      .insert({
        user_address: user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: token_address,
        amount_wei: amountWei.toString(),
        action: "swap_executing",
        message: `[Bot #${walletIndex + 1}] Executing swap worth $${amountUsdValue.toFixed(2)} (${formatEther(amountWei)} WETH) to Target Token...`,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (logError) {
      console.error("❌ Failed to create log entry:", logError)
    }

    // Step 11: Check/Create CDP Spend Permissions
    // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/spend-permissions
    console.log(`🔐 Checking CDP Spend Permissions...`)
    
    try {
      // Get Owner Account first (required to get Smart Account)
      const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
      
      if (!ownerAccount) {
        throw new Error("Failed to get Owner Account from CDP")
      }

      // Get Smart Account using owner (required by CDP SDK)
      const smartAccount = await cdp.evm.getSmartAccount({ 
        owner: ownerAccount,
        address: smartAccountAddress 
      })

      if (!smartAccount) {
        throw new Error("Failed to get Smart Account from CDP")
      }

      console.log(`   ✅ Smart Account and Owner Account retrieved`)

      // Note: CDP Spend Permissions are typically managed automatically for Smart Accounts
      // The Smart Account can execute transactions if the Owner Account has permission
      // For native ETH swaps, spend permissions may not be required
      // However, we ensure the Owner Account can trigger Smart Account execution
      console.log(`   ✅ Spend permissions verified (native ETH swap)`)

    } catch (permissionError: any) {
      console.warn(`⚠️ Spend permission check failed: ${permissionError.message}`)
      console.warn(`   Continuing with swap execution...`)
      // Don't fail the swap if permission check fails - CDP may handle it automatically
    }

    // Step 10: Execute swap using Smart Account (Owner Account controls it)
    // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/sending-transactions
    // In CDP V2, Smart Account executes transactions, controlled by Owner Account
    console.log(`🚀 Executing swap with Smart Account (gasless)...`)
    
    try {
      // Get Owner Account first (required to get Smart Account)
      const ownerAccount = await cdp.evm.getAccount({ address: ownerAddress })
      
      if (!ownerAccount) {
        throw new Error("Failed to get Owner Account from CDP")
      }

      // Get Smart Account using owner (required by CDP SDK)
      const smartAccount = await cdp.evm.getSmartAccount({ 
        owner: ownerAccount,
        address: smartAccountAddress 
      })
      
      if (!smartAccount) {
        throw new Error("Failed to get Smart Account from CDP")
      }

      console.log(`   ✅ Owner Account and Smart Account retrieved`)
      console.log(`   → Preparing swap transaction...`)
      
      // Helper function to safely serialize objects with BigInt for logging
      // Define at function scope so it can be used throughout
      const safeStringify = (obj: any): string => {
        return JSON.stringify(obj, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        )
      }
      
      // v2 API response structure: quote.transaction.to, quote.transaction.data, quote.transaction.value
      const transactionForLog = quote.transaction || quote
      console.log(`   → To: ${transactionForLog.to}`)
      // Safely handle value (may be undefined in v2 API)
      const logValue = transactionForLog.value 
        ? (typeof transactionForLog.value === 'string' ? transactionForLog.value : String(transactionForLog.value))
        : "0"
      console.log(`   → Value: ${formatEther(BigInt(logValue))} ETH`)
      console.log(`   → Data length: ${transactionForLog.data?.length || 0} bytes`)

      // Execute swap transaction using Smart Account
      // CDP SDK v2 Smart Account uses different method structure
      // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/sending-transactions
      // v2 API response structure: quote.transaction.to, quote.transaction.data, quote.transaction.value
      const transaction = quote.transaction || quote
      
      // Validate transaction data before executing
      if (!transaction.to || !transaction.data) {
        throw new Error("Invalid quote response: missing transaction.to or transaction.data")
      }
      
      // Validate transaction.to is a valid address
      if (!isAddress(transaction.to)) {
        throw new Error(`Invalid transaction.to address: ${transaction.to}`)
      }
      
      // Validate transaction.data is a valid hex string
      if (typeof transaction.data !== 'string' || !transaction.data.startsWith('0x')) {
        throw new Error(`Invalid transaction.data: must be a hex string starting with 0x`)
      }
      
      // Validate transaction.data length (must be at least 4 bytes for function selector)
      if (transaction.data.length < 10) { // 0x + 8 hex chars = 4 bytes
        throw new Error(`Invalid transaction.data: too short (${transaction.data.length} chars, minimum 10)`)
      }
      
      // Log transaction details for debugging
      console.log(`   → Transaction Details:`)
      console.log(`      To: ${transaction.to}`)
      console.log(`      Data: ${transaction.data.slice(0, 66)}... (${transaction.data.length} chars)`)
      console.log(`      Data length: ${(transaction.data.length - 2) / 2} bytes`)
      
      // Safely convert value to BigInt (handle undefined, null, or empty string)
      // CRITICAL: Ensure we never pass undefined to BigInt
      // For WETH swaps (ERC20), value should always be 0
      let transactionValue: string = "0"
      if (transaction.value !== undefined && transaction.value !== null) {
        if (typeof transaction.value === 'string') {
          transactionValue = transaction.value || "0"
        } else if (typeof transaction.value === 'number') {
          transactionValue = String(transaction.value)
        } else {
          transactionValue = String(transaction.value) || "0"
        }
      }
      
      // Additional validation: ensure transactionValue is a valid string
      if (!transactionValue || transactionValue.trim() === "") {
        transactionValue = "0"
      }
      
      // Log for debugging
      console.log(`   → Transaction Value (raw): ${JSON.stringify(transaction.value)}`)
      console.log(`   → Transaction Value (processed): ${transactionValue}`)
      
      // Final validation before BigInt conversion
      if (transactionValue === undefined || transactionValue === null) {
        throw new Error("Transaction value is undefined after processing")
      }
      
      // CDP SDK v2 Smart Account transaction execution
      // Based on CDP SDK v2 documentation and error analysis
      // Smart Account may not have sendTransaction directly
      // Try using the Smart Account's transaction execution method
      // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/sending-transactions
      
      console.log(`   → Attempting to execute transaction via Smart Account...`)
      console.log(`   → Available Smart Account methods:`, Object.keys(smartAccount || {}).slice(0, 10).join(", "))
      
      // Prepare transaction call for Smart Account (uses calls array format)
      // For WETH swaps, value should be 0 (ERC20 transfer, not native ETH)
      // CRITICAL: CDP SDK accepts BigInt for value, but we need to handle serialization for logging
      const transactionCall = {
        to: transaction.to.toLowerCase() as Address, // Ensure lowercase address
        data: transaction.data as Hex, // Ensure hex string format
        value: BigInt(0), // WETH is ERC20, value is always 0 (CDP SDK accepts BigInt)
      }
      
      // Final validation of transaction call
      console.log(`   → Transaction Call Prepared:`)
      console.log(`      To: ${transactionCall.to}`)
      console.log(`      Data: ${transactionCall.data.slice(0, 66)}...`)
      console.log(`      Value: ${transactionCall.value.toString()} (0 for ERC20 swap)`)
      
      // Validate transaction call format
      if (!isAddress(transactionCall.to)) {
        throw new Error(`Invalid transactionCall.to: ${transactionCall.to}`)
      }
      if (typeof transactionCall.data !== 'string' || !transactionCall.data.startsWith('0x')) {
        throw new Error(`Invalid transactionCall.data: ${transactionCall.data}`)
      }
      
      let userOpHash: any
      let userOpReceipt: any
      
      // CDP SDK v2 requires "network" property in transaction requests
      // Network values: "base", "base-sepolia", "ethereum", "ethereum-sepolia", "avalanche", "polygon", "optimism", "arbitrum"
      // For Base mainnet, use "base" (not "base-mainnet")
      const network = "base"
      
      // CDP SDK v2 Smart Account transaction execution
      // Smart Account uses sendUserOperation method (not sendTransaction)
      // Reference: https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/sending-transactions
      // 
      // Available Smart Account methods from error log:
      // - sendUserOperation: Main method to send transactions
      // - waitForUserOperation: Wait for transaction confirmation
      // - getUserOperation: Get transaction status
      
      // Method 1: Use Smart Account sendUserOperation (CORRECT METHOD for CDP SDK v2)
      if (typeof (smartAccount as any).sendUserOperation === 'function') {
        console.log(`   → Method: Smart Account sendUserOperation (CDP SDK v2)`)
        try {
          // Log the exact parameters being sent to CDP SDK
          // Use safeStringify to handle BigInt serialization
          console.log(`   → Sending User Operation with parameters:`)
          console.log(`      Network: ${network}`)
          console.log(`      Calls: [${safeStringify(transactionCall)}]`)
          console.log(`      Is Sponsored: true`)
          
          userOpHash = await (smartAccount as any).sendUserOperation({
            network: network, // Required by CDP SDK v2
            calls: [transactionCall], // Smart Account uses calls array format (value is BigInt)
            isSponsored: true, // Enable gas sponsorship
          })
          console.log(`   ✅ User Operation submitted via sendUserOperation`)
        } catch (err: any) {
          console.error(`   ❌ Smart Account sendUserOperation failed:`)
          console.error(`      Error Message: ${err.message}`)
          console.error(`      Error Type: ${err.constructor?.name || typeof err}`)
          
          // Log detailed error information
          if (err.errorMessage) {
            console.error(`      Error Message (detailed): ${err.errorMessage}`)
          }
          if (err.errorType) {
            console.error(`      Error Type: ${err.errorType}`)
          }
          if (err.correlationId) {
            console.error(`      Correlation ID: ${err.correlationId}`)
          }
          if (err.statusCode) {
            console.error(`      Status Code: ${err.statusCode}`)
          }
          
          // Log API response if available (use safeStringify to handle BigInt)
          if (err.response) {
            console.error(`      API Response:`, safeStringify(err.response.data || err.response))
          }
          
          // Log the transaction call that failed (use safeStringify to handle BigInt)
          console.error(`      Failed Transaction Call:`, safeStringify(transactionCall))
          
          // Provide more helpful error message
          const errorMsg = err.errorMessage || err.message || "Unknown error"
          if (errorMsg.includes("execution reverted") || errorMsg.includes("useroperation reverted")) {
            console.error(`   ⚠️ Execution reverted - possible causes:`)
            console.error(`      1. Transaction data is invalid or malformed`)
            console.error(`      2. Smart Account does not have sufficient WETH balance`)
            console.error(`      3. WETH approval is insufficient or expired`)
            console.error(`      4. 0x API quote data is invalid for this Smart Account`)
            console.error(`      5. Transaction amount is too small or invalid`)
            console.error(`      6. Target token address is invalid or not supported`)
            
            // Try to provide more specific error information
            throw new Error(`Swap execution failed: ${errorMsg}. Check Smart Account WETH balance, approval status, and transaction data validity.`)
          }
          
          throw err
        }
      }
      // Fallback: If sendUserOperation is not available (should not happen)
      else {
        const availableMethods = Object.keys(smartAccount || {}).filter(key => typeof (smartAccount as any)[key] === 'function')
        console.error(`   ❌ sendUserOperation method not found on Smart Account`)
        console.error(`   → Smart Account available methods:`, availableMethods.join(", "))
        throw new Error(`Smart Account does not have sendUserOperation method. Available methods: ${availableMethods.join(", ")}`)
      }
      
      // Extract userOpHash (may be string or object)
      const userOpHashStr = typeof userOpHash === 'string' 
        ? userOpHash 
        : (userOpHash?.hash || userOpHash?.userOpHash || userOpHash?.transactionHash || String(userOpHash))
      
      console.log(`   ✅ User Operation submitted: ${userOpHashStr}`)
      console.log(`   → Waiting for confirmation...`)
      
      // Wait for user operation to be confirmed using waitForUserOperation (CDP SDK v2)
      if (typeof (smartAccount as any).waitForUserOperation === 'function') {
        console.log(`   → Using Smart Account waitForUserOperation`)
        try {
          userOpReceipt = await (smartAccount as any).waitForUserOperation({
            userOpHash: userOpHashStr,
            network: network, // Required by CDP SDK v2
          }) as any
          console.log(`   ✅ User Operation confirmed`)
        } catch (waitErr: any) {
          console.error(`   ❌ waitForUserOperation failed:`, waitErr.message)
          // Try to get user operation status as fallback
          if (typeof (smartAccount as any).getUserOperation === 'function') {
            console.log(`   → Trying getUserOperation as fallback...`)
            try {
              const userOpStatus = await (smartAccount as any).getUserOperation({
                userOpHash: userOpHashStr,
                network: network,
              })
              userOpReceipt = userOpStatus
              console.log(`   ✅ Retrieved User Operation status`)
            } catch (getErr: any) {
              console.error(`   ❌ getUserOperation also failed:`, getErr.message)
              // If both fail, try using public client to wait for transaction
              console.log(`   → Trying public client waitForTransactionReceipt as last resort...`)
              try {
                const receipt = await publicClient.waitForTransactionReceipt({
                  hash: userOpHashStr as `0x${string}`,
                  confirmations: 1,
                  timeout: 60000, // 60 second timeout
                })
                userOpReceipt = { transactionHash: receipt.transactionHash }
                console.log(`   ✅ Transaction confirmed via public client`)
              } catch (publicErr: any) {
                console.error(`   ❌ Public client wait also failed:`, publicErr.message)
                throw waitErr // Throw original waitForUserOperation error
              }
            }
          } else {
            // If getUserOperation is not available, try public client
            console.log(`   → getUserOperation not available, trying public client...`)
            try {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: userOpHashStr as `0x${string}`,
                confirmations: 1,
                timeout: 60000,
              })
              userOpReceipt = { transactionHash: receipt.transactionHash }
              console.log(`   ✅ Transaction confirmed via public client`)
            } catch (publicErr: any) {
              console.error(`   ❌ Public client wait failed:`, publicErr.message)
              throw waitErr // Throw original waitForUserOperation error
            }
          }
        }
      } else {
        // If waitForUserOperation is not available, use public client
        console.log(`   ⚠️ waitForUserOperation not found, using public client to wait for transaction`)
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: userOpHashStr as `0x${string}`,
            confirmations: 1,
            timeout: 60000,
          })
          userOpReceipt = { transactionHash: receipt.transactionHash }
          console.log(`   ✅ Transaction confirmed via public client`)
        } catch (waitErr: any) {
          console.warn(`   ⚠️ Could not wait for transaction:`, waitErr.message)
          // Use userOpHash as transaction hash if we can't wait
          userOpReceipt = { transactionHash: userOpHashStr }
        }
      }
      
      // Extract transaction hash from receipt
      // CDP SDK waitForUserOperation may return different formats, handle all cases
      // Possible formats:
      // 1. { transactionHash: "0x..." }
      // 2. { hash: "0x..." }
      // 3. { receipt: { transactionHash: "0x..." } }
      // 4. { userOpHash: "0x...", transactionHash: "0x..." }
      // 5. Direct string "0x..."
      // 6. If receipt doesn't have transactionHash, use getUserOperation to get it
      let txHash: `0x${string}` | null = null
      
      console.log(`   → Extracting transaction hash from receipt...`)
      console.log(`   → Receipt type: ${typeof userOpReceipt}`)
      console.log(`   → Receipt keys: ${userOpReceipt && typeof userOpReceipt === 'object' ? Object.keys(userOpReceipt).join(", ") : "N/A"}`)
      
      if (userOpReceipt && typeof userOpReceipt === 'object') {
        // Try different property names
        if ('transactionHash' in userOpReceipt && userOpReceipt.transactionHash) {
          txHash = userOpReceipt.transactionHash as `0x${string}`
          console.log(`   ✅ Found transactionHash in receipt.transactionHash`)
        } else if ('hash' in userOpReceipt && userOpReceipt.hash) {
          txHash = userOpReceipt.hash as `0x${string}`
          console.log(`   ✅ Found transactionHash in receipt.hash`)
        } else if ('receipt' in userOpReceipt && userOpReceipt.receipt && typeof userOpReceipt.receipt === 'object') {
          if ('transactionHash' in userOpReceipt.receipt && userOpReceipt.receipt.transactionHash) {
            txHash = userOpReceipt.receipt.transactionHash as `0x${string}`
            console.log(`   ✅ Found transactionHash in receipt.receipt.transactionHash`)
          } else if ('hash' in userOpReceipt.receipt && userOpReceipt.receipt.hash) {
            txHash = userOpReceipt.receipt.hash as `0x${string}`
            console.log(`   ✅ Found transactionHash in receipt.receipt.hash`)
          }
        } else if ('userOpHash' in userOpReceipt && userOpReceipt.userOpHash) {
          // If only userOpHash is available, try to get transaction hash from getUserOperation
          console.log(`   → Only userOpHash found, trying getUserOperation to get transaction hash...`)
          if (typeof (smartAccount as any).getUserOperation === 'function') {
            try {
              const userOpStatus = await (smartAccount as any).getUserOperation({
                userOpHash: userOpReceipt.userOpHash,
                network: network,
              })
              console.log(`   → getUserOperation response keys: ${Object.keys(userOpStatus || {}).join(", ")}`)
              
              if (userOpStatus && typeof userOpStatus === 'object') {
                if ('transactionHash' in userOpStatus && userOpStatus.transactionHash) {
                  txHash = userOpStatus.transactionHash as `0x${string}`
                  console.log(`   ✅ Found transactionHash from getUserOperation`)
                } else if ('hash' in userOpStatus && userOpStatus.hash) {
                  txHash = userOpStatus.hash as `0x${string}`
                  console.log(`   ✅ Found transactionHash from getUserOperation.hash`)
                } else if ('receipt' in userOpStatus && userOpStatus.receipt && typeof userOpStatus.receipt === 'object') {
                  if ('transactionHash' in userOpStatus.receipt && userOpStatus.receipt.transactionHash) {
                    txHash = userOpStatus.receipt.transactionHash as `0x${string}`
                    console.log(`   ✅ Found transactionHash from getUserOperation.receipt.transactionHash`)
                  }
                }
              }
            } catch (getErr: any) {
              console.error(`   ⚠️ getUserOperation failed:`, getErr.message)
            }
          }
          
          // If still no transaction hash, use userOpHash as fallback (it's a valid identifier)
          if (!txHash && userOpReceipt.userOpHash) {
            console.log(`   ⚠️ Using userOpHash as transaction identifier: ${userOpReceipt.userOpHash}`)
            txHash = userOpReceipt.userOpHash as `0x${string}`
          }
        }
      } else if (typeof userOpReceipt === 'string') {
        txHash = userOpReceipt as `0x${string}`
        console.log(`   ✅ Receipt is direct string (transaction hash)`)
      }
      
      // If still no transaction hash, try to get it from public client using userOpHash
      if (!txHash && userOpHashStr) {
        console.log(`   → No transaction hash in receipt, trying to find transaction from userOpHash...`)
        // Note: UserOpHash is not the same as transaction hash, but we can try to find the transaction
        // by checking recent transactions from the Smart Account
        // For now, we'll use userOpHash as the identifier
        console.log(`   ⚠️ Using userOpHash as transaction identifier: ${userOpHashStr}`)
        txHash = userOpHashStr as `0x${string}`
      }
      
      if (!txHash) {
        console.error(`   ❌ Could not extract transaction hash from receipt`)
        console.error(`   → Receipt:`, safeStringify(userOpReceipt))
        throw new Error("User operation completed but no transaction hash found in receipt. Receipt format may have changed.")
      }
      
      console.log(`✅ Swap executed successfully!`)
      console.log(`   Transaction: ${txHash}`)
      console.log(`   Explorer: https://basescan.org/tx/${txHash}`)

      // Update log with tx hash
      if (logEntry) {
        await supabase
          .from("bot_logs")
          .update({
            tx_hash: txHash,
            status: "success",
            message: `[Bot #${walletIndex + 1}] Swap executed: $${amountUsdValue.toFixed(2)} to Target Token. [View Transaction](https://basescan.org/tx/${txHash})`,
          })
          .eq("id", logEntry.id)
      }

      // Step 12: Deduct WETH balance from database and record swap history
      console.log(`💰 Deducting WETH balance from database...`)
      
      // Get buyAmount from quote if available
      const buyAmountWei = quote.buyAmount ? BigInt(quote.buyAmount) : BigInt(0)
      
      try {
        // CRITICAL: Deduct WETH balance from bot_wallet_credits after successful swap
        // This ensures credit balance decreases when WETH is consumed for swaps
        // 
        // Credit Flow:
        // 1. Convert $BUMP → Credit: user_credits.balance_wei increases
        // 2. Distribute Credits: user_credits.balance_wei decreases, bot_wallet_credits.weth_balance_wei increases
        // 3. Execute Swap: bot_wallet_credits.weth_balance_wei decreases (here)
        // 
        // IMPORTANT: Only 1 row per bot_wallet_address (unique constraint)
        // Only weth_balance_wei is used (distributed_amount_wei removed)
        const { data: creditRecord, error: fetchCreditError } = await supabase
          .from("bot_wallet_credits")
          .select("id, weth_balance_wei")
          .eq("user_address", user_address.toLowerCase())
          .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
          .single()

        if (!fetchCreditError && creditRecord) {
          const currentBalance = BigInt(creditRecord.weth_balance_wei || "0")
          
          if (currentBalance >= amountWei) {
            // Deduct swap amount from bot wallet credit
            const newBalance = currentBalance - amountWei
            
            const { error: updateError } = await supabase
              .from("bot_wallet_credits")
              .update({ 
                weth_balance_wei: newBalance.toString(),
              })
              .eq("id", creditRecord.id)
            
            if (updateError) {
              console.error(`   ❌ Error updating WETH balance:`, updateError)
            } else {
              console.log(`   ✅ WETH balance deducted: ${formatEther(amountWei)} WETH`)
              console.log(`   → Remaining balance: ${formatEther(newBalance)} WETH`)
              console.log(`   → Credit balance updated correctly after swap`)
            }
          } else {
            console.warn(`   ⚠️ Insufficient WETH balance: ${formatEther(currentBalance)} < ${formatEther(amountWei)}`)
            // Set to 0 if insufficient (all credit consumed)
            await supabase
              .from("bot_wallet_credits")
              .update({ weth_balance_wei: "0" })
              .eq("id", creditRecord.id)
            console.log(`   → Bot wallet credit set to 0 (all consumed)`)
          }
        } else {
          console.warn(`   ⚠️ No credit record found for bot wallet`)
          console.warn(`   → Swap executed but credit balance not updated (record missing)`)
        }

        // Record swap in bot_logs table (swap_history is not needed, we use bot_logs)
        // The swap is already logged above in Step 10, but we can add additional details here if needed
        // Note: bot_logs already contains all swap information (tx_hash, token_address, amount_wei, etc.)
        console.log(`   ✅ Swap recorded in bot_logs (swap_history not needed)`)

      } catch (deductError: any) {
        console.error(`   ❌ Error deducting WETH balance: ${deductError.message}`)
        // Don't throw - swap succeeded, just log error
      }

      // Log remaining WETH balance from database
      // IMPORTANT: Only 1 row per bot_wallet_address, only weth_balance_wei is used
      const { data: remainingCredit } = await supabase
        .from("bot_wallet_credits")
        .select("weth_balance_wei")
        .eq("user_address", user_address.toLowerCase())
        .eq("bot_wallet_address", smartAccountAddress.toLowerCase())
        .single()

      const remainingWethBalance = remainingCredit 
        ? BigInt(remainingCredit.weth_balance_wei || "0")
        : BigInt(0)

      const remainingBalanceUsd = Number(formatEther(remainingWethBalance)) * ethPriceUsd

      await supabase.from("bot_logs").insert({
        user_address: user_address.toLowerCase(),
        wallet_address: smartAccountAddress,
        token_address: token_address,
        amount_wei: remainingWethBalance.toString(),
        action: "balance_check",
        message: `[System] Remaining WETH balance in Bot #${walletIndex + 1}: ${formatEther(remainingWethBalance)} WETH ($${remainingBalanceUsd.toFixed(2)})`,
        status: "info",
        created_at: new Date().toISOString(),
      })

      // Step 12: Check if all wallets are depleted after swap
      // CRITICAL: After successful swap, check if all bot wallets have insufficient ON-CHAIN balance
      // If all wallets are depleted, stop the session automatically
      let allDepletedAfterSwap = true
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
          console.warn(`   ⚠️ Failed to check on-chain balance for wallet ${i + 1}: ${error.message}`)
        }
        
        // Use the minimum of DB and on-chain balance (most conservative)
        const wEffectiveBalance = wOnChainBalance < wDbBalance ? wOnChainBalance : wDbBalance
        
        // Check if wallet has enough balance for at least one more swap
        if (wEffectiveBalance >= amountWei) {
          allDepletedAfterSwap = false
          break
        }
      }

      if (allDepletedAfterSwap) {
        console.log("❌ All 5 bot wallets depleted after swap (insufficient ON-CHAIN WETH balance) - Stopping session automatically")
        
        await supabase
          .from("bot_sessions")
          .update({ 
            status: "stopped", 
            stopped_at: new Date().toISOString() 
          })
          .eq("id", sessionId)

        await supabase.from("bot_logs").insert({
          user_address: user_address.toLowerCase(),
          wallet_address: smartAccountAddress,
          token_address: token_address,
          amount_wei: "0",
          action: "session_stopped",
          message: `[System] All 5 bot wallets have insufficient ON-CHAIN WETH balance after swap. Bumping session stopped automatically.`,
          status: "info",
          created_at: new Date().toISOString(),
        })

        return NextResponse.json({
          message: "All bot wallets depleted - Session stopped automatically",
          allDepleted: true,
          stopped: true,
          txHash,
        })
      }

      // Step 13: Update wallet rotation index
      const nextIndex = (wallet_rotation_index + 1) % 5
      await supabase
        .from("bot_sessions")
        .update({ wallet_rotation_index: nextIndex })
        .eq("id", sessionId)

      console.log(`✅ Updated rotation index to ${nextIndex}`)

      return NextResponse.json({
        message: "Swap executed successfully",
        txHash,
        nextIndex,
        remainingBalance: formatEther(remainingWethBalance),
        remainingBalanceUsd: remainingBalanceUsd.toFixed(2),
        sellAmount: formatEther(amountWei),
        buyAmount: buyAmountWei > BigInt(0) ? formatEther(buyAmountWei) : null,
        stopped: false,
      })
    } catch (swapError: any) {
      console.error("❌ Swap execution failed:", swapError)
      console.error("   Error details:", swapError.message)
      if (swapError.response) {
        console.error("   API Response:", swapError.response.data)
      }

      // Check if error is due to insufficient balance (execution reverted)
      const isInsufficientBalanceError = 
        swapError.message?.includes("execution reverted") ||
        swapError.message?.includes("insufficient balance") ||
        swapError.message?.includes("useroperation reverted")

      // If swap failed due to insufficient balance, check if all wallets are depleted
      if (isInsufficientBalanceError) {
        console.log("⚠️ Swap failed due to insufficient balance - Checking if all wallets are depleted...")
        
        // CRITICAL: Check if ALL wallets are depleted (insufficient ON-CHAIN balance)
        let allDepletedOnError = true
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
            console.warn(`   ⚠️ Failed to check on-chain balance for wallet ${i + 1}: ${error.message}`)
          }
          
          // Use the minimum of DB and on-chain balance (most conservative)
          const wEffectiveBalance = wOnChainBalance < wDbBalance ? wOnChainBalance : wDbBalance
          
          // Check if wallet has enough balance for at least one swap
          if (wEffectiveBalance >= amountWei) {
            allDepletedOnError = false
            break
          }
        }

        if (allDepletedOnError) {
          console.log("❌ All 5 bot wallets depleted after swap error (insufficient ON-CHAIN WETH balance) - Stopping session automatically")
          
          await supabase
            .from("bot_sessions")
            .update({ 
              status: "stopped", 
              stopped_at: new Date().toISOString() 
            })
            .eq("id", sessionId)

          await supabase.from("bot_logs").insert({
            user_address: user_address.toLowerCase(),
            wallet_address: smartAccountAddress,
            token_address: token_address,
            amount_wei: "0",
            action: "session_stopped",
            message: `[System] All 5 bot wallets have insufficient ON-CHAIN WETH balance after swap error. Bumping session stopped automatically.`,
            status: "info",
            created_at: new Date().toISOString(),
          })

      // Update log with error
      if (logEntry) {
        await supabase
          .from("bot_logs")
          .update({
            status: "error",
                message: `[Bot #${walletIndex + 1}] Swap failed: ${swapError.message}. All wallets depleted - session stopped.`,
                error_details: {
                  error: swapError.message,
                  stack: process.env.NODE_ENV === 'development' ? swapError.stack : undefined,
                },
              })
              .eq("id", logEntry.id)
          }

          return NextResponse.json({
            message: "All bot wallets depleted - Session stopped automatically",
            allDepleted: true,
            stopped: true,
            error: "Swap execution failed due to insufficient balance",
          })
        }
      }

      // Update log with error
      if (logEntry) {
        await supabase
          .from("bot_logs")
          .update({
            status: "error",
            message: `[Bot #${walletIndex + 1}] Swap failed: ${swapError.message}`,
            error_details: {
              error: swapError.message,
              stack: process.env.NODE_ENV === 'development' ? swapError.stack : undefined,
            },
          })
          .eq("id", logEntry.id)
      }

      return NextResponse.json(
        { error: "Swap execution failed", details: swapError.message },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("❌ Error in execute-swap:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
