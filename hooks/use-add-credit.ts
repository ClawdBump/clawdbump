"use client"

import { useState, useCallback } from "react"
import { formatEther } from "viem"
import { toast } from "sonner"

interface AddCreditParams {
  userAddress: string
  amountWei?: string
  txHash?: string
  syncOnly?: boolean
}

interface AddCreditResponse {
  success: boolean
  message: string
  previousCreditWei: string
  previousCreditEth: string
  newCreditWei: string
  newCreditEth: string
  addedWei: string
  addedEth: string
  onChainBalanceWei: string
  onChainBalanceEth: string
  txHash?: string
  synced?: boolean
}

/**
 * Hook to add credit to user account when they deposit ETH/WETH
 * 
 * Usage:
 * 1. User deposits ETH or WETH to their Privy Smart Account
 * 2. Call addCredit() to update database with new balance
 * 3. Credit balance will be updated and reflected in UI
 * 
 * Modes:
 * - Auto mode: Sync database credit to on-chain balance if on-chain is higher
 * - Add mode: Add specific amount to credit (requires amountWei)
 * - Sync mode: Force sync database to on-chain balance (set syncOnly=true)
 * 
 * Example:
 * ```tsx
 * const { addCredit, isPending, isSuccess } = useAddCredit()
 * 
 * // After user deposits 1 ETH
 * await addCredit({
 *   userAddress: "0x...",
 *   amountWei: parseEther("1").toString(),
 *   txHash: "0x...",
 * })
 * ```
 */
export function useAddCredit() {
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [response, setResponse] = useState<AddCreditResponse | null>(null)

  const reset = useCallback(() => {
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
    setResponse(null)
  }, [])

  const addCredit = useCallback(async (params: AddCreditParams) => {
    reset()
    setIsPending(true)

    try {
      console.log("💰 Adding credit to user account...")
      console.log(`   → User: ${params.userAddress}`)
      if (params.amountWei) {
        console.log(`   → Amount: ${formatEther(BigInt(params.amountWei))} ETH`)
      }
      if (params.txHash) {
        console.log(`   → Transaction: ${params.txHash}`)
      }

      const response = await fetch("/api/credit/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to add credit")
      }

      console.log("✅ Credit added successfully!")
      console.log(`   → Previous: ${data.previousCreditEth} ETH`)
      console.log(`   → New: ${data.newCreditEth} ETH`)
      console.log(`   → Added: ${data.addedEth} ETH`)

      setResponse(data)
      setIsSuccess(true)

      // Show success toast
      if (data.synced === false) {
        toast.info("Credit already up to date", {
          description: `Current balance: ${data.currentCreditEth} ETH`,
        })
      } else if (params.syncOnly) {
        toast.success("Credit synced with on-chain balance", {
          description: `New balance: ${data.newCreditEth} ETH`,
        })
      } else {
        toast.success("Credit added successfully", {
          description: `Added ${data.addedEth} ETH. New balance: ${data.newCreditEth} ETH`,
        })
      }

      return data
    } catch (err: any) {
      console.error("❌ Failed to add credit:", err)
      setError(err)

      // User-friendly error messages
      let errorMessage = err.message || "Failed to add credit"

      toast.error("Failed to add credit", { 
        description: errorMessage,
      })

      throw err
    } finally {
      setIsPending(false)
    }
  }, [reset])

  return { 
    addCredit, 
    isPending, 
    isSuccess, 
    error, 
    response,
    reset 
  }
}

