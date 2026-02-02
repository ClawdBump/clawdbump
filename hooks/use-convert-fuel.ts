"use client"

import { useState } from "react"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { usePublicClient } from "wagmi"
import { parseUnits, type Address, encodeFunctionData, type Hex } from "viem"
import {
  BUMP_TOKEN_ADDRESS,
  TREASURY_ADDRESS,
  BASE_WETH_ADDRESS,
  BUMP_DECIMALS,
  TREASURY_FEE_BPS,
  APP_FEE_BPS,
} from "@/lib/constants"

// 0x Protocol AllowanceHolder contract on Base Mainnet
// This contract holds token allowances for 0x swaps
const ZEROX_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734" as const

// ERC20 ABI for transfer and approve
const ERC20_ABI = [
  {
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

// ERC20 ABI is already defined above, we'll use it for WETH transfer
// WETH is an ERC20 token, so we use the same ABI for transfer

export function useConvertFuel() {
  const { client: smartWalletClient } = useSmartWallets()
  const publicClient = usePublicClient()
  
  const [hash, setHash] = useState<Hex | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [swapStatus, setSwapStatus] = useState<string>("")

  const get0xQuote = async (sellAmountWei: bigint, taker: Address) => {
    const params = new URLSearchParams({
      sellToken: BUMP_TOKEN_ADDRESS,
      buyToken: BASE_WETH_ADDRESS, // Use WETH for better route discovery
      sellAmount: sellAmountWei.toString(),
      takerAddress: taker,
      slippagePercentage: "0.03", // 3% slippage for $BUMP token
    })

    const res = await fetch(`/api/0x-quote?${params.toString()}`)
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || data.reason || "Failed to get swap route")
    }
    return data
  }

  const convert = async (amount: string) => {
    setIsPending(true)
    setIsSuccess(false)
    setError(null)

    try {
      if (!smartWalletClient || !publicClient) {
        throw new Error("Smart Wallet client not found. Please login again.")
      }

      // CRITICAL: Only allow whole numbers (integers), no decimals
      // Parse and validate that amount is a whole number
      const amountNumber = parseFloat(amount)
      if (isNaN(amountNumber) || amountNumber <= 0) {
        throw new Error("Please enter a valid whole number greater than 0")
      }
      
      // Check if amount has decimal places
      if (amountNumber % 1 !== 0) {
        throw new Error("Only whole numbers are allowed. Please enter a number without decimals (e.g., 100 instead of 100.5)")
      }
      
      // Ensure amount is a whole number string (remove any decimal part)
      const wholeNumberAmount = Math.floor(amountNumber).toString()

      const userAddress = smartWalletClient.account.address as Address
      const totalAmountWei = parseUnits(wholeNumberAmount, BUMP_DECIMALS)

      // Calculate amounts using BigInt for precision:
      // - 5% $BUMP → Treasury (TREASURY_FEE_BPS = 500)
      // - 95% $BUMP → Swap to ETH
      const treasuryFeeWei = (totalAmountWei * BigInt(TREASURY_FEE_BPS)) / BigInt(10000)
      const swapAmountWei = totalAmountWei - treasuryFeeWei // 95% of total

      console.log("🔄 Starting Convert $BUMP to Credit...")
      console.log(`💰 Total Amount: ${wholeNumberAmount} $BUMP (whole number only)`)
      console.log(`📤 Treasury Fee (5% $BUMP): ${treasuryFeeWei.toString()} wei`)
      console.log(`💱 Swap Amount (95% $BUMP): ${swapAmountWei.toString()} wei`)

      // Get 0x API quote for 95% swap amount
      setSwapStatus("Fetching quote from 0x API...")
      const quote = await get0xQuote(swapAmountWei, userAddress)

      // Calculate expected WETH amount from swap (quote.buyAmount is WETH)
      const totalWethReceivedWei = BigInt(quote.buyAmount)
      
      // Calculate 5% of WETH result for Treasury (APP_FEE_BPS = 500)
      // This represents 5% of the total initial value in WETH
      const treasuryWethWei = (totalWethReceivedWei * BigInt(APP_FEE_BPS)) / BigInt(10000)
      const userCreditWethWei = totalWethReceivedWei - treasuryWethWei // 90% WETH remains in Smart Wallet as Credit
      
      // expectedEthWei is the 90% WETH credit that will be added to user balance
      // Note: We use "eth" naming for backward compatibility, but it's actually WETH
      const expectedEthWei = userCreditWethWei

      console.log(`📊 Distribution after swap (WETH):`)
      console.log(`   - Total WETH from swap: ${totalWethReceivedWei.toString()} wei`)
      console.log(`   - Treasury WETH (5%): ${treasuryWethWei.toString()} wei`)
      console.log(`   - User Credit WETH (90%): ${userCreditWethWei.toString()} wei`)

      setSwapStatus("Preparing transactions...")

      // Execute transactions in sequence using sendTransaction with calls array:
      // 1. Transfer 5% $BUMP to Treasury
      // 2. Approve 95% $BUMP to 0x AllowanceHolder
      // 3. Execute swap 95% $BUMP through 0x → WETH
      // 4. Transfer 5% WETH to Treasury (remaining 90% WETH stays in Smart Wallet as Credit)
      // IMPORTANT: Keep WETH as WETH (don't unwrap to ETH) for gasless transactions
      const txHash = await smartWalletClient.sendTransaction({
        calls: [
          // Step 1: Transfer 5% $BUMP to Treasury
          {
            to: BUMP_TOKEN_ADDRESS as Address,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "transfer",
              args: [TREASURY_ADDRESS as Address, treasuryFeeWei],
            }),
            value: BigInt(0),
          },
          // Step 2: Approve 95% $BUMP to 0x AllowanceHolder
          {
            to: BUMP_TOKEN_ADDRESS as Address,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [ZEROX_ALLOWANCE_HOLDER as Address, swapAmountWei],
            }),
            value: BigInt(0),
          },
          // Step 3: Execute swap 95% $BUMP through 0x Settler contract → WETH
          {
            to: quote.transaction.to as Address,
            data: quote.transaction.data as Hex,
            value: BigInt(quote.transaction.value || "0"),
          },
          // Step 4: Transfer 5% WETH to Treasury (remaining 90% WETH stays as Credit)
          // IMPORTANT: Keep WETH as WETH, don't unwrap to ETH
          {
            to: BASE_WETH_ADDRESS as Address,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "transfer",
              args: [TREASURY_ADDRESS as Address, treasuryWethWei], // 5% WETH to Treasury
            }),
            value: BigInt(0),
          },
        ] as any,
      })

      console.log("✅ Transaction sent! Hash:", txHash)
      setHash(txHash)
      setSwapStatus("Transaction confirmed on-chain")

      // Wait for transaction confirmation
      if (publicClient) {
        try {
          console.log("⏳ Waiting for transaction confirmation...")
          await publicClient.waitForTransactionReceipt({ 
            hash: txHash,
            timeout: 120000, // 2 minutes timeout
            confirmations: 1 // Wait for at least 1 confirmation
          })
          console.log("✅ Transaction confirmed on-chain")
          
          // Add a small delay to ensure receipt is fully indexed
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (confirmationError: any) {
          console.warn("⚠️ Transaction confirmation timeout, but transaction was sent:", confirmationError)
          // Still try to sync credit - API will retry fetching receipt
          console.log("   Will attempt to sync credit anyway (API will retry receipt fetch)")
        }
      }

      // Sync credit to database
      try {
        console.log("📤 Syncing credit to database...")
        const response = await fetch("/api/sync-credit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            txHash: txHash,
            userAddress: userAddress,
            amountBump: wholeNumberAmount, // Use whole number amount
            amountBumpWei: totalAmountWei.toString(),
            expectedEthWei: expectedEthWei.toString(), // Pass expected ETH from quote for fallback verification
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || "Failed to sync credit")
        }

        const result = await response.json()
        console.log("✅ Credit synced:", result)
      } catch (syncError: any) {
        console.error("Failed to sync credit (transaction succeeded):", syncError)
        // Don't throw - transaction succeeded, sync can be retried
      }

      setIsSuccess(true)
      setSwapStatus("")
      return txHash
    } catch (err: any) {
      console.error("Convert Error:", err)
      setSwapStatus("")
      
      let friendlyMessage = err.message || "Transaction failed"
      if (friendlyMessage.includes("timeout") || friendlyMessage.includes("timed out")) {
        friendlyMessage = "Transaction request timed out. Please try again in a few moments."
      } else if (friendlyMessage.includes("insufficient funds")) {
        friendlyMessage = "Insufficient $BUMP balance for conversion."
      } else if (friendlyMessage.includes("Failed to fetch") || friendlyMessage.includes("network")) {
        friendlyMessage = "Network error. Please check your internet connection."
      }

      setError(new Error(friendlyMessage))
      throw new Error(friendlyMessage)
    } finally {
      setIsPending(false)
    }
  }

  const reset = () => {
    setHash(null)
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
    setSwapStatus("")
  }

  return { 
    convert, 
    reset,
    hash, 
    isPending, 
    isSuccess, 
    error,
    swapStatus,
    approve: async () => ({ approved: true, hash: null }),
    isApproving: false,
    approvalHash: null
  }
}
