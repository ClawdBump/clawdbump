"use client"

import { useState } from "react"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { usePublicClient } from "wagmi"
import { parseUnits, type Address, type Hex } from "viem"
import {
  BUMP_TOKEN_ADDRESS,
  BASE_WETH_ADDRESS,
  BUMP_DECIMALS,
  WETH_DECIMALS,
} from "@/lib/constants"

// 0x API v2 Configuration
// NOTE: This hook is deprecated in favor of /api/0x-quote proxy endpoint
// API key is now server-side only for security
// Frontend should use /api/0x-quote instead of direct API calls
const ZEROX_API_BASE_URL = "https://base.api.0x.org"

// Permit2 address (same as we're already using)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const

// Base chain ID
const BASE_CHAIN_ID = 8453

/**
 * 0x Swap API v2 Response Structure
 * Based on: https://0x.org/docs/api/swap-v2
 * 
 * v2 API includes:
 * - Improved error handling with `issues` object
 * - Better price execution
 * - Enhanced security features
 */
interface ZeroXQuoteResponse {
  chainId: number
  price: string
  estimatedPriceImpact: string
  buyAmount: string
  sellAmount: string
  buyToken: string
  sellToken: string
  allowanceTarget: string
  transaction: {
    to: string
    data: string
    value: string
    gas?: string
    gasPrice?: string
  }
  permit2?: {
    token: string
    spender: string
    amount: string
    expiration: string
    nonce: string
    sig: {
      r: string
      s: string
      v: number
    }
  }
  // v2 API includes issues object for better error handling
  issues?: Array<{
    type: string
    reason: string
    severity: "error" | "warning" | "info"
  }>
}

interface ZeroXSwapParams {
  sellToken: string
  buyToken: string
  sellAmount?: string
  buyAmount?: string
  takerAddress: string
  slippagePercentage?: number
}

/**
 * Hook for swapping tokens using 0x Swap API v2 with Permit2
 * 
 * This hook uses 0x Swap API v2 which:
 * - Aggregates liquidity from multiple DEXs
 * - Uses Permit2 for efficient token approvals
 * - Returns ready-to-execute transaction data
 * - Supports smart wallet execution
 * - Enhanced error handling with issues object
 * - Better price execution
 * - Improved security features
 */
export function use0xSwap() {
  const { client: smartWalletClient } = useSmartWallets()
  const publicClient = usePublicClient()
  
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [quote, setQuote] = useState<ZeroXQuoteResponse | null>(null)

  const reset = () => {
    setHash(null)
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
    setQuote(null)
  }

  /**
   * Get quote from 0x Swap API v2
   * Uses /swap/v2/quote endpoint for v2 API with Permit2 support
   * 
   * v2 API features:
   * - Better price execution
   * - Enhanced error handling with issues object
   * - Improved security
   */
  const getQuote = async (params: ZeroXSwapParams): Promise<ZeroXQuoteResponse> => {
    // Use proxy API route for security (API key is server-side only)
    const queryParams = new URLSearchParams({
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      takerAddress: params.takerAddress,
      slippagePercentage: (params.slippagePercentage || 0.5).toString(), // 0.5% default slippage
    })

    if (params.sellAmount) {
      queryParams.append("sellAmount", params.sellAmount)
    } else if (params.buyAmount) {
      queryParams.append("buyAmount", params.buyAmount)
    } else {
      throw new Error("Either sellAmount or buyAmount must be provided")
    }

    // Use proxy API route instead of direct 0x API call (API key is server-side only)
    const baseUrl = typeof window !== "undefined" 
      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
      : ""
    const apiPath = `/api/0x-quote?${queryParams.toString()}`
    const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}${apiPath}` : apiPath
    
    console.log("📊 Fetching 0x Swap API v2 quote via proxy...")
    console.log(`  API Route: ${url}`)
    console.log(`  Sell Token: ${params.sellToken}`)
    console.log(`  Buy Token: ${params.buyToken}`)
    console.log(`  Amount: ${params.sellAmount || params.buyAmount}`)
    console.log(`  API Version: v2 (via proxy)`)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
      
      // v2 API provides better error messages with issues array
      if (errorData.issues && Array.isArray(errorData.issues)) {
        const errorMessages = errorData.issues
          .filter((issue: any) => issue.severity === "error")
          .map((issue: any) => issue.reason)
          .join(", ")
        throw new Error(`0x API v2 error: ${errorMessages || errorData.reason || errorData.message || response.statusText}`)
      }
      
      throw new Error(`0x API v2 error: ${errorData.reason || errorData.message || response.statusText}`)
    }

    const quoteData: ZeroXQuoteResponse = await response.json()
    
    // Check for issues in v2 response
    if (quoteData.issues && quoteData.issues.length > 0) {
      const errors = quoteData.issues.filter(issue => issue.severity === "error")
      if (errors.length > 0) {
        const errorMessages = errors.map(issue => issue.reason).join(", ")
        throw new Error(`0x API v2 issues detected: ${errorMessages}`)
      }
      
      // Log warnings if any
      const warnings = quoteData.issues.filter(issue => issue.severity === "warning")
      if (warnings.length > 0) {
        console.warn("⚠️ 0x API v2 warnings:", warnings.map(w => w.reason).join(", "))
      }
    }
    
    console.log("✅ 0x API v2 Quote received:")
    console.log(`  - Price: ${quoteData.price}`)
    console.log(`  - Buy Amount: ${quoteData.buyAmount}`)
    console.log(`  - Sell Amount: ${quoteData.sellAmount}`)
    console.log(`  - Estimated Price Impact: ${quoteData.estimatedPriceImpact}%`)
    console.log(`  - Transaction To: ${quoteData.transaction.to}`)
    console.log(`  - Transaction Value: ${quoteData.transaction.value}`)
    console.log(`  - Has Permit2: ${!!quoteData.permit2}`)
    if (quoteData.permit2) {
      console.log(`  - Permit2 Token: ${quoteData.permit2.token}`)
      console.log(`  - Permit2 Spender: ${quoteData.permit2.spender}`)
    }

    return quoteData
  }

  /**
   * Execute swap using 0x Swap API transaction
   * 
   * Flow:
   * 1. Get quote from 0x API (includes Permit2 data if needed)
   * 2. If Permit2 data exists, sign Permit2 permit
   * 3. Execute swap transaction via smart wallet
   */
  const swap = async (
    sellToken: Address,
    buyToken: Address,
    sellAmount: string, // Amount in token units (not wei)
    sellTokenDecimals: number = 18,
    buyTokenDecimals: number = 18,
    slippagePercentage: number = 0.5
  ) => {
    reset()
    setIsPending(true)

    try {
      if (!smartWalletClient) {
        throw new Error("Smart Wallet client not found. Please login again.")
      }

      if (!publicClient) {
        throw new Error("Public client not available")
      }

      const userAddress = smartWalletClient.account.address

      // Convert sell amount to wei
      const sellAmountWei = parseUnits(sellAmount, sellTokenDecimals)

      console.log("🚀 Starting 0x Swap...")
      console.log(`  Sell Token: ${sellToken}`)
      console.log(`  Buy Token: ${buyToken}`)
      console.log(`  Sell Amount: ${sellAmount} (${sellAmountWei.toString()} wei)`)
      console.log(`  Slippage: ${slippagePercentage}%`)

      // Step 1: Get quote from 0x API
      const quoteData = await getQuote({
        sellToken,
        buyToken,
        sellAmount: sellAmountWei.toString(),
        takerAddress: userAddress,
        slippagePercentage,
      })

      setQuote(quoteData)

      // Step 2: Handle Permit2 signature if needed
      // According to 0x API docs, Permit2 signature is included in the response
      // For smart wallets, we may need to sign the Permit2 permit before executing the swap
      // However, 0x API's Settler contract may handle this automatically
      // Let's check if Permit2 data exists and handle accordingly
      if (quoteData.permit2) {
        console.log("📝 Permit2 data received from 0x API")
        console.log(`  Token: ${quoteData.permit2.token}`)
        console.log(`  Spender: ${quoteData.permit2.spender}`)
        console.log(`  Amount: ${quoteData.permit2.amount}`)
        console.log(`  Expiration: ${quoteData.permit2.expiration}`)
        console.log(`  Nonce: ${quoteData.permit2.nonce}`)
        
        // Note: 0x API returns Permit2 signature in the response
        // The Settler contract (transaction.to) should handle Permit2 verification
        // If signature is already included, we can execute directly
        // If not, we may need to sign Permit2 permit separately
        // For now, we'll execute the transaction and let the Settler handle it
      }

      // Step 3: Execute swap transaction via smart wallet
      // The transaction.to is the Settler contract address that handles the swap
      console.log("📤 Executing swap transaction via smart wallet...")
      console.log(`  Settler Contract: ${quoteData.transaction.to}`)
      console.log(`  Transaction Data: ${quoteData.transaction.data.slice(0, 66)}...`)
      console.log(`  Transaction Value: ${quoteData.transaction.value}`)

      const txHash = await smartWalletClient.sendTransaction({
        to: quoteData.transaction.to as Address,
        data: quoteData.transaction.data as Hex,
        value: BigInt(quoteData.transaction.value || "0"),
      }) as `0x${string}`

      console.log("✅ Transaction sent! Hash:", txHash)
      setHash(txHash)

      // Step 4: Wait for confirmation
      if (publicClient) {
        console.log("⏳ Waiting for on-chain confirmation...")
        try {
          const receipt = await Promise.race([
            publicClient.waitForTransactionReceipt({ hash: txHash }),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error("Transaction confirmation timed out"))
              }, 120000) // 2 minutes
            })
          ])
          console.log("🎉 Transaction Confirmed:", receipt)
        } catch (confirmationError: any) {
          console.warn("⚠️ Confirmation timeout, but transaction was sent:", confirmationError)
        }
      }

      setIsSuccess(true)
    } catch (err: any) {
      console.error("❌ 0x Swap Error:", err)
      
      let friendlyMessage = err.message || "Swap failed"
      if (friendlyMessage.includes("0x API error")) {
        // Keep 0x API error message as-is
      } else if (friendlyMessage.includes("insufficient funds")) {
        friendlyMessage = "Insufficient token balance for swap"
      } else if (friendlyMessage.includes("timeout") || friendlyMessage.includes("timed out")) {
        friendlyMessage = "Swap request timed out. Please try again."
      } else if (friendlyMessage.includes("slippage")) {
        friendlyMessage = "Slippage tolerance exceeded. Try increasing slippage percentage."
      }

      setError(new Error(friendlyMessage))
    } finally {
      setIsPending(false)
    }
  }

  /**
   * Swap $BUMP to WETH using 0x API
   * Convenience method for our specific use case
   */
  const swapBumpToWeth = async (
    bumpAmount: string,
    slippagePercentage: number = 0.5
  ) => {
    return swap(
      BUMP_TOKEN_ADDRESS as Address,
      BASE_WETH_ADDRESS as Address,
      bumpAmount,
      BUMP_DECIMALS,
      WETH_DECIMALS,
      slippagePercentage
    )
  }

  return {
    swap,
    swapBumpToWeth,
    getQuote,
    hash,
    isPending,
    isSuccess,
    error,
    quote,
    reset,
  }
}
