"use client"

import { useState, useCallback } from "react"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { usePublicClient } from "wagmi"
import { formatEther, getAddress, encodeFunctionData, type Address, type Hex } from "viem"
import { toast } from "sonner"

// WETH Contract Address (Base Network)
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const

// WETH ABI for deposit and transfer
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

interface BotWallet {
  smartWalletAddress: string
  ownerAddress?: string
  network?: string
}

interface DistributeCreditsParams {
  userAddress: Address
  botWallets: BotWallet[]
  creditBalanceWei: bigint
  preferNativeEth?: boolean // If true, distribute Native ETH instead of WETH (default: false)
}

export function useDistributeCredits() {
  const { client: smartWalletClient } = useSmartWallets()
  const publicClient = usePublicClient()
  
  const privySmartWalletAddress = smartWalletClient?.account?.address as Address | undefined
  
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const reset = useCallback(() => {
    setHash(null)
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
    setStatus(null)
  }, [])

  const distribute = useCallback(async ({ 
    userAddress, 
    botWallets, 
    creditBalanceWei,
    preferNativeEth = false // Default: use WETH (legacy behavior)
  }: DistributeCreditsParams) => {
    reset()
    setIsPending(true)

    try {
      if (!smartWalletClient || !privySmartWalletAddress) {
        throw new Error("Smart Wallet client not found. Please login again.")
      }

      const smartWalletAddress = userAddress.toLowerCase() === privySmartWalletAddress.toLowerCase()
        ? privySmartWalletAddress
        : (userAddress as Address)

      if (!botWallets || botWallets.length !== 5) {
        throw new Error(`Expected 5 bot wallets, but found ${botWallets?.length || 0}`)
      }

      console.log("=====================================")
      console.log("💰 DISTRIBUTE CREDITS - USER SMART WALLET")
      console.log("=====================================")
      console.log(`📊 Smart Wallet: ${smartWalletAddress}`)
      console.log(`📊 Bot Wallets: ${botWallets.length}`)

      setStatus("Checking balance & status...")
      
      // Get Native ETH balance
      const nativeEthBalance = await publicClient.getBalance({ address: smartWalletAddress })
      
      // Get WETH balance
      const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const
      const WETH_ABI = [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
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
      
      let wethBalance = BigInt(0)
      try {
        wethBalance = await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: WETH_ABI,
          functionName: "balanceOf",
          args: [smartWalletAddress as Address],
        }) as bigint
      } catch (error) {
        console.warn("⚠️ Failed to fetch WETH balance, assuming 0")
      }

      // Fetch credit balance from database (credit-balance API)
      // CRITICAL: This API returns WETH from database (user_credits.balance_wei)
      // Credits are added when user deposits ETH/WETH to their Smart Account
      console.log(`\n💰 Fetching credit balance from database (main wallet)...`)
      const creditResponse = await fetch("/api/credit-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })
      
      const creditData = await creditResponse.json()
      // Use mainWalletCreditWei from database (ETH/WETH deposits to Smart Account)
      const mainWalletCreditWei = BigInt(creditData.mainWalletCreditWei || "0")

      if (mainWalletCreditWei <= BigInt(0)) {
        throw new Error(
          "No credit available in main wallet.\n\n" +
          "Please deposit ETH or WETH to your Privy Smart Account to add credits."
        )
      }
      
      console.log(`   → Credit from database: ${formatEther(mainWalletCreditWei)} WETH`)
      console.log(`   → Credits are added when ETH/WETH is deposited to Smart Account`)

      // =============================================
      // Calculate Distribution Amount
      // CRITICAL: Credit to distribute = WETH from database (user_credits.balance_wei)
      // Credits are added when ETH/WETH is deposited to Smart Account
      // We need to ensure we have enough WETH (or convert Native ETH to WETH)
      // =============================================
      setStatus("Calculating distribution amount...")
      
      console.log(`\n📊 Distribution Calculation:`)
      console.log(`   → Native ETH Balance (on-chain): ${formatEther(nativeEthBalance)} ETH`)
      console.log(`   → WETH Balance (on-chain): ${formatEther(wethBalance)} WETH`)
      console.log(`   → Total Available (ETH + WETH): ${formatEther(nativeEthBalance + wethBalance)} ETH`)
      console.log(`   → Credit from database: ${formatEther(mainWalletCreditWei)} WETH`)

      // Total available on-chain = Native ETH + WETH (for conversion if needed)
      const totalAvailable = nativeEthBalance + wethBalance
      
      // CRITICAL: Sync database credit with on-chain balance if they differ
      // If on-chain balance is less than database credit, adjust credit to distribute
      // On-chain balance is the source of truth (what we can actually distribute)
      let creditToDistribute: bigint = mainWalletCreditWei
      let balanceWasSynced = false
      
      if (totalAvailable < mainWalletCreditWei) {
        console.warn(`⚠️ Balance mismatch detected:`)
        console.warn(`   → On-chain balance: ${formatEther(totalAvailable)} ETH (${formatEther(nativeEthBalance)} Native + ${formatEther(wethBalance)} WETH)`)
        console.warn(`   → Database credit: ${formatEther(mainWalletCreditWei)} WETH`)
        console.warn(`   → Difference: ${formatEther(mainWalletCreditWei - totalAvailable)} WETH`)
        console.warn(`   → Syncing database credit to match on-chain balance...`)
        
        // Sync database credit to on-chain balance
        try {
          const syncResponse = await fetch("/api/sync-credit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              userAddress,
              onChainBalanceWei: totalAvailable.toString()
            }),
          })
          
          if (syncResponse.ok) {
            const syncData = await syncResponse.json()
            if (syncData.synced) {
              console.log(`   ✅ Database credit synced to on-chain balance`)
              balanceWasSynced = true
            } else {
              console.log(`   ℹ️ Database balance already in sync or higher`)
            }
          } else {
            const errorData = await syncResponse.json().catch(() => ({}))
            console.warn(`   ⚠️ Failed to sync database credit: ${errorData.error || syncResponse.statusText}`)
          }
          
          // Always use on-chain balance as credit to distribute (source of truth)
          // This prevents errors when database shows credit but on-chain balance is insufficient
          creditToDistribute = totalAvailable
        } catch (syncError: any) {
          console.warn(`   ⚠️ Error syncing database credit: ${syncError.message}`)
          // Use on-chain balance as credit to distribute anyway (source of truth)
          creditToDistribute = totalAvailable
        }
      } else if (totalAvailable > mainWalletCreditWei) {
        // On-chain balance is higher than database credit
        // This could mean user received direct WETH transfers (not counted as credit)
        // We still use database credit as credit to distribute (prevents bypass)
        console.log(`ℹ️ On-chain balance (${formatEther(totalAvailable)} ETH) is higher than database credit (${formatEther(mainWalletCreditWei)} WETH)`)
        console.log(`   → Using database credit for distribution (direct WETH transfers not counted)`)
        creditToDistribute = mainWalletCreditWei
      }
      
      // Check if wallet has enough balance (ETH + WETH) to cover credit distribution
      // We can convert Native ETH to WETH if needed
      if (totalAvailable < creditToDistribute) {
        throw new Error(
          `Insufficient balance for distribution.\n` +
          `Available: ${formatEther(totalAvailable)} ETH (${formatEther(nativeEthBalance)} Native + ${formatEther(wethBalance)} WETH)\n` +
          `Credit to distribute: ${formatEther(creditToDistribute)} WETH\n\n` +
          `Please deposit more ETH or WETH to your Privy Smart Account.`
        )
      }
      
      // If credit was adjusted, show info to user
      if (creditToDistribute < mainWalletCreditWei) {
        const adjustedAmount = formatEther(mainWalletCreditWei - creditToDistribute)
        if (balanceWasSynced) {
          toast.info(
            `Balance synced: ${adjustedAmount} WETH adjusted to match on-chain balance`,
            { duration: 5000 }
          )
        } else {
          toast.warning(
            `Using available balance: ${formatEther(creditToDistribute)} WETH (${adjustedAmount} WETH less than database credit)`,
            { duration: 5000 }
          )
        }
      }

      console.log(`   → Credit to distribute: ${formatEther(creditToDistribute)} ETH`)
      
      // Calculate how much will come from WETH vs Native ETH (for logging)
      const wethToUse = wethBalance >= creditToDistribute ? creditToDistribute : wethBalance
      const ethToConvert = creditToDistribute > wethBalance ? creditToDistribute - wethBalance : BigInt(0)
      console.log(`   → Will use: ${formatEther(wethToUse)} WETH + ${formatEther(ethToConvert)} Native ETH (to be converted)`)

      // Calculate amount per bot
      const amountPerBot: bigint = creditToDistribute / BigInt(5)
      const remainder: bigint = creditToDistribute % BigInt(5)
      const amountForFirstBot: bigint = amountPerBot + remainder

      console.log(`\n📦 Distribution per bot:`)
      console.log(`   → Amount per bot: ${formatEther(amountPerBot)} ETH ${preferNativeEth ? '(Native ETH)' : '(will be converted to WETH)'}`)
      if (remainder > BigInt(0)) {
        console.log(`   → First bot gets remainder: +${formatEther(remainder)} ETH`)
      }

      // =============================================
      // STEP 1: Decide distribution strategy
      // - If preferNativeEth = true: Distribute Native ETH directly (no conversion)
      // - If preferNativeEth = false: Convert to WETH then distribute (legacy)
      // =============================================
      let depositTxHash: `0x${string}` | null = null
      let distributeNativeEth = preferNativeEth
      let distributeWeth = !preferNativeEth
      
      if (preferNativeEth) {
        console.log(`\n💰 Distribution Strategy: NATIVE ETH`)
        console.log(`   → Will distribute ${formatEther(creditToDistribute)} Native ETH directly`)
        console.log(`   → No WETH conversion needed`)
        console.log(`   → Bot wallets will receive Native ETH (Base chain ETH)`)
        setStatus("Preparing Native ETH distribution...")
      } else {
        // Legacy behavior: Convert to WETH
        setStatus("Preparing WETH...")
        
        console.log(`\n💱 Ensuring WETH balance...`)
        console.log(`   → WETH Contract: ${WETH_ADDRESS}`)
        console.log(`   → Credit to distribute: ${formatEther(creditToDistribute)} ETH`)
        console.log(`   → Current WETH balance: ${formatEther(wethBalance)} WETH`)
        console.log(`   → Strategy: Use existing WETH or convert Native ETH to WETH`)
        
        // Calculate how much WETH we need to convert from Native ETH
        const wethNeeded = creditToDistribute > wethBalance ? creditToDistribute - wethBalance : BigInt(0)
        
        if (wethNeeded > BigInt(0)) {
        if (nativeEthBalance < wethNeeded) {
          throw new Error(
            `Insufficient Native ETH for conversion.\n` +
            `Need: ${formatEther(wethNeeded)} ETH\n` +
            `Available: ${formatEther(nativeEthBalance)} ETH`
          )
        }
        
        console.log(`   → Converting ${formatEther(wethNeeded)} Native ETH to WETH...`)
        setStatus("Converting ETH to WETH...")

        try {
          // Encode deposit function call (WETH.deposit())
          const depositData = encodeFunctionData({
            abi: WETH_ABI,
            functionName: "deposit",
          })

          // Send transaction to WETH contract with ETH value
          depositTxHash = await smartWalletClient.sendTransaction({
            to: WETH_ADDRESS,
            value: wethNeeded,
            data: depositData,
          }) as `0x${string}`

          console.log(`   ✅ WETH deposit transaction submitted: ${depositTxHash}`)
          setHash(depositTxHash)
          
          // Wait for deposit confirmation
          const depositReceipt = await publicClient.waitForTransactionReceipt({
            hash: depositTxHash,
            confirmations: 1,
          })

          if (depositReceipt.status !== "success") {
            throw new Error("WETH deposit transaction failed on-chain")
          }

          console.log(`   ✅ ${formatEther(wethNeeded)} ETH successfully converted to WETH!`)
          console.log(`      → Block: ${depositReceipt.blockNumber}`)
        } catch (depositError: any) {
          console.error(`   ❌ WETH deposit failed:`, depositError.message)
          throw new Error(`Failed to deposit ETH to WETH: ${depositError.message}`)
        }
        } else {
          console.log(`   ✅ Already have enough WETH (${formatEther(wethBalance)} WETH)`)
          console.log(`   → No conversion needed`)
        }
        
        console.log(`   → Total WETH available for distribution: ${formatEther(creditToDistribute)} WETH`)
      }

      // =============================================
      // STEP 2: Execute Transfers (Native ETH or WETH)
      // - If preferNativeEth: Send Native ETH directly (value field)
      // - If !preferNativeEth: Send WETH (ERC20 transfer)
      // Privy automatically handles sponsorship via Dashboard configuration
      // =============================================
      const txHashes: `0x${string}`[] = []
      
      if (preferNativeEth) {
        // =============== NATIVE ETH DISTRIBUTION ===============
        setStatus("Distributing Native ETH...")
        
        console.log(`\n📤 Sending NATIVE ETH transfers...`)
        console.log(`   → Smart Wallet: ${smartWalletAddress}`)
        console.log(`   → Total transfers: ${botWallets.length}`)
        console.log(`   → Strategy: Individual Native ETH transfers (no WETH conversion)`)
        console.log(`   → Privy will automatically handle sponsorship via Dashboard configuration`)
        
        // Try batch transfer first
        setStatus("Preparing batch Native ETH transfer...")
        
        console.log(`\n📤 Attempting BATCH Native ETH transfer...`)
        let batchSuccess = false
        let batchTxHash: `0x${string}` | null = null
        
        try {
          // Prepare all Native ETH transfer calls for batch
          const batchCalls = botWallets.map((wallet, index) => {
            const amount: bigint = index === 0 ? amountForFirstBot : amountPerBot
            const checksumAddress = getAddress(wallet.smartWalletAddress)
            
            return {
              to: checksumAddress as Address,
              value: amount, // Native ETH transfer uses value field
              data: '0x' as Hex, // No data for Native ETH transfer
            }
          })
          
          console.log(`   → Executing batch transaction with ${batchCalls.length} Native ETH transfers...`)
          
          // Execute batch transaction
          batchTxHash = await smartWalletClient.sendTransaction({
            calls: batchCalls as any,
          }) as `0x${string}`
          
          console.log(`   ✅ Batch Native ETH transfer submitted: ${batchTxHash}`)
          batchSuccess = true
          txHashes.push(batchTxHash)
          
        } catch (batchError: any) {
          console.warn(`   ⚠️ Batch Native ETH transfer failed: ${batchError.message}`)
          console.log(`   → Falling back to individual Native ETH transfers...`)
          batchSuccess = false
        }
        
        // Fallback to individual Native ETH transfers if batch failed
        if (!batchSuccess) {
          console.log(`\n📤 Executing INDIVIDUAL Native ETH transfers (fallback)...`)
          
          for (let i = 0; i < botWallets.length; i++) {
            const wallet = botWallets[i]
            const amount: bigint = i === 0 ? amountForFirstBot : amountPerBot
            const checksumAddress = getAddress(wallet.smartWalletAddress)
            
            setStatus(`Sending Native ETH transfer ${i + 1}/${botWallets.length}...`)
            
            console.log(`\n   📤 Native ETH Transfer ${i + 1}/${botWallets.length}:`)
            console.log(`      → To: ${checksumAddress}`)
            console.log(`      → Amount: ${formatEther(amount)} ETH`)

            try {
              // Execute individual Native ETH transfer
              const txHash = await smartWalletClient.sendTransaction({
                to: checksumAddress as Address,
                value: amount, // Native ETH
                data: '0x' as Hex,
              }) as `0x${string}`

              txHashes.push(txHash)
              console.log(`      ✅ Native ETH Transfer ${i + 1} submitted: ${txHash}`)
              
            } catch (transferError: any) {
              console.error(`      ❌ Native ETH Transfer ${i + 1} failed:`, transferError.message)
              throw transferError
            }
          }
        }
      } else {
        // =============== WETH DISTRIBUTION (Legacy) ===============
        setStatus("Preparing WETH distribution...")
        
        console.log(`\n📤 Sending WETH transfers...`)
        console.log(`   → Smart Wallet: ${smartWalletAddress}`)
        console.log(`   → Total transfers: ${botWallets.length}`)
        console.log(`   → Strategy: Individual WETH (ERC20) transfers`)
        console.log(`   → Privy will automatically handle sponsorship via Dashboard configuration`)

        // Try batch transaction first (faster, single transaction)
        // If batch fails, fallback to individual transactions
        setStatus("Preparing batch WETH transfer...")
        
        console.log(`\n📤 Attempting BATCH WETH transfer (all transfers in one transaction)...`)
        console.log(`   → Smart Wallet: ${smartWalletAddress}`)
        console.log(`   → Total transfers: ${botWallets.length}`)
        console.log(`   → Strategy: Batch all WETH transfers in single transaction (faster, no delay)`)
        
        let batchSuccess = false
        let batchTxHash: `0x${string}` | null = null
        
        try {
          // Prepare all WETH transfer calls for batch
          const batchCalls = botWallets.map((wallet, index) => {
            const amount: bigint = index === 0 ? amountForFirstBot : amountPerBot
            const checksumAddress = getAddress(wallet.smartWalletAddress)
            
            const transferData = encodeFunctionData({
              abi: WETH_ABI,
              functionName: "transfer",
              args: [checksumAddress as Address, amount],
            })
            
            return {
              to: WETH_ADDRESS,
              data: transferData,
              value: BigInt(0), // ERC20 transfer, value is 0
            }
          })
          
          console.log(`   → Executing batch transaction with ${batchCalls.length} WETH transfers...`)
          
          // Execute batch transaction
          batchTxHash = await smartWalletClient.sendTransaction({
            calls: batchCalls as any,
          }) as `0x${string}`
          
          console.log(`   ✅ Batch WETH transfer submitted: ${batchTxHash}`)
          batchSuccess = true
          txHashes.push(batchTxHash)
          
        } catch (batchError: any) {
          console.warn(`   ⚠️ Batch WETH transfer failed: ${batchError.message}`)
          console.log(`   → Falling back to individual WETH transfers...`)
          batchSuccess = false
        }
        
        // Fallback to individual WETH transfers if batch failed
        if (!batchSuccess) {
          console.log(`\n📤 Executing INDIVIDUAL WETH transfers (fallback)...`)
          
          for (let i = 0; i < botWallets.length; i++) {
            const wallet = botWallets[i]
            const amount: bigint = i === 0 ? amountForFirstBot : amountPerBot
            const checksumAddress = getAddress(wallet.smartWalletAddress)
            
            setStatus(`Sending WETH transfer ${i + 1}/${botWallets.length}...`)
            
            console.log(`\n   📤 WETH Transfer ${i + 1}/${botWallets.length}:`)
            console.log(`      → To: ${checksumAddress}`)
            console.log(`      → Amount: ${formatEther(amount)} WETH`)

            try {
              // Encode WETH transfer function call (WETH.transfer(address, uint256))
              const transferData = encodeFunctionData({
                abi: WETH_ABI,
                functionName: "transfer",
                args: [checksumAddress as Address, amount],
              })

              // Execute individual WETH transfer
              const txHash = await smartWalletClient.sendTransaction({
                to: WETH_ADDRESS,
                data: transferData,
                value: BigInt(0), // ERC20 transfer, value is 0
              }) as `0x${string}`

              txHashes.push(txHash)
              console.log(`      ✅ WETH Transfer ${i + 1} submitted: ${txHash}`)
              
            } catch (transferError: any) {
              console.error(`      ❌ WETH Transfer ${i + 1} failed:`, transferError.message)
              throw transferError
            }
          }
        }
      } // End of WETH distribution block

      // Use deposit transaction hash as primary (or first transfer if deposit failed)
      const txHash = depositTxHash || (txHashes.length > 0 ? txHashes[0] : null)

      if (!txHash || txHashes.length === 0) {
        throw new Error("All individual transactions failed")
      }

      if (txHashes.length < botWallets.length) {
        console.warn(`⚠️ Only ${txHashes.length}/${botWallets.length} transfers succeeded`)
      } else {
        console.log(`✅ All ${txHashes.length} individual transactions submitted successfully!`)
      }

      setHash(txHash)
      setStatus("Confirming on blockchain...")

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })

      if (receipt.status !== "success") {
        throw new Error("Transaction failed on-chain")
      }

      console.log(`✅ Transaction confirmed!`)
      console.log(`   → Block: ${receipt.blockNumber}`)
      console.log(`   → Gas used: ${receipt.gasUsed.toString()}`)

      // Record distribution in database
      // Note: Record as Native ETH or WETH depending on distribution strategy
      setStatus("Recording distribution...")
      
      const distributions = botWallets.map((wallet, index) => {
        const distAmount: bigint = index === 0 ? amountForFirstBot : amountPerBot
        return {
          botWalletAddress: wallet.smartWalletAddress,
          amountWei: distAmount.toString(), // Total amount distributed
          nativeEthAmountWei: preferNativeEth ? distAmount.toString() : "0", // Native ETH amount
          wethAmountWei: !preferNativeEth ? distAmount.toString() : "0", // WETH amount
        }
      })

      try {
        await fetch("/api/bot/record-distribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: userAddress,
            distributions: distributions,
            txHash: txHash,
          }),
        })
        console.log("✅ Distribution recorded in database")
      } catch (recordError) {
        console.warn("⚠️ Failed to record distribution in database:", recordError)
      }

      // =============================================
      // CREDIT DEDUCTION LOGIC:
      // When distributing from main wallet to bot wallets:
      // 1. Native ETH or WETH is transferred on-chain (main → bot wallets)
      // 2. bot_wallet_credits (native_eth_balance_wei or weth_balance_wei) is INCREASED
      // 3. user_credits.balance_wei is DECREASED
      // 
      // This prevents double counting:
      // - Before: user_credits = 1 ETH, bot_credits = 0 → Total = 1 ETH ✅
      // - After: user_credits = 0, bot_credits = 1 ETH → Total = 1 ETH ✅
      // - Without deduction: user_credits = 1, bot_credits = 1 → Total = 2 ETH ❌
      // 
      // The record-distribution API handles both operations atomically
      // =============================================
      const assetType = preferNativeEth ? "Native ETH" : "WETH"
      console.log(`\n💰 Credit distribution completed!`)
      console.log(`   → ${assetType} transferred on-chain: ${formatEther(creditToDistribute)} ${assetType}`)
      console.log(`   → Database updated: Added to bot wallets, deducted from main wallet`)
      console.log(`   → Credit balance is now correctly distributed (no double counting)`)

      setIsSuccess(true)
      setStatus("Distribution completed!")
      
      toast.success(`Successfully distributed ${assetType} credit to 5 bot wallets!`, {
        description: `Total: ${formatEther(creditToDistribute)} ${assetType}`,
        action: {
          label: "View",
          onClick: () => window.open(`https://basescan.org/tx/${txHash}`, "_blank"),
        },
      })

      return {
        success: true,
        txHash: txHash,
        amountPerBot: formatEther(amountPerBot),
        totalDistributed: formatEther(creditToDistribute),
        gasUsed: receipt.gasUsed.toString(),
        method: "user_smart_wallet_individual",
      }

    } catch (err: any) {
      console.error("❌ Distribution failed:", err)
      setError(err)
      setStatus(null)

      // User-friendly error messages
      let errorMessage = err.message || "Failed to distribute credits"

      if (errorMessage.includes("insufficient") || errorMessage.includes("Insufficient")) {
        errorMessage = "Insufficient ETH balance for gas and distribution. Please add more ETH to your wallet."
      } else if (errorMessage.includes("rejected") || errorMessage.includes("denied") || errorMessage.includes("User rejected")) {
        errorMessage = "Transaction was rejected by user."
      }

      toast.error("Distribution failed", { 
        description: errorMessage,
      })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [smartWalletClient, privySmartWalletAddress, publicClient, reset])

  return { distribute, hash, isPending, isSuccess, error, status, reset }
}
