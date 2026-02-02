"use client"

import { useQuery } from "@tanstack/react-query"
import { createSupabaseClient } from "@/lib/supabase"
import { formatUnits } from "viem"

interface CreditBalance {
  balanceWei: string
  balanceEth: string
  balanceUsd: number | null
  lastUpdated: string | null
}

/**
 * Fetches user credit balance and converts to USD
 * Uses real-time ETH price from CoinGecko API
 * 
 * IMPORTANT: This is NOT the $BUMP token balance!
 * - Credit Balance = Total ETH value from:
 *   1. Main Smart Wallet: Actual ETH + WETH balance (on-chain, real-time)
 *   2. Bot Smart Wallets: WETH balance from database (weth_balance_wei)
 * 
 * CRITICAL CHANGE (Latest):
 * - Main wallet credit is now fetched from BLOCKCHAIN (actual ETH + WETH balance)
 * - NOT from user_credits.balance_wei database (only used for audit/history)
 * - This ensures credit decreases naturally when distributing to bot wallets
 * 
 * Credit Calculation:
 * - Main wallet credit: Actual ETH + WETH in smart wallet (on-chain)
 * - Bot wallet credits: Sum of weth_balance_wei from bot_wallet_credits table
 * - Total credit = Main wallet (ETH + WETH) + Bot wallets WETH
 * - USD value = Total ETH credit × Current ETH price
 * 
 * Why this approach?
 * 1. When user converts $BUMP to credit → ETH/WETH added to main wallet
 * 2. When distributing to bot wallets → ETH/WETH moves from main wallet to bot wallets
 * 3. Main wallet balance decreases automatically (on-chain)
 * 4. No need to manually track in database for display
 * 
 * This hook is completely independent from withdraw operations.
 * Withdraw uses useBumpBalance() which reads $BUMP token balance from blockchain.
 */
export function useCreditBalance(userAddress: string | null, options?: { enabled?: boolean }) {
  // CRITICAL: Initialize Supabase client inside hook (not at module level)
  // This ensures environment variables are available when hook is called
  // Using lazy initialization to prevent "Cannot access before initialization" errors
  const supabase = createSupabaseClient()
  
  // Track if 406 error occurred - disable query if RLS policy not fixed
  const has406Error = typeof window !== "undefined" && sessionStorage.getItem("credit_406_error") === "true"
  const enabled = options?.enabled !== false && !!userAddress && !has406Error

  return useQuery<CreditBalance>({
    queryKey: ["credit-balance", userAddress],
    queryFn: async () => {
      if (!userAddress) {
        throw new Error("User address is required")
      }

      // CRITICAL: Use backend API to fetch credit balance
      // Backend fetches actual ETH + WETH from blockchain for main wallet
      // This ensures credit decreases naturally when distributing
      const creditResponse = await fetch("/api/credit-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })

      if (!creditResponse.ok) {
        const errorData = await creditResponse.json().catch(() => ({}))
        
        // Handle 406 errors gracefully (RLS policy issue)
        if (creditResponse.status === 406) {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("credit_406_error", "true")
            
            if (!sessionStorage.getItem("credit_406_warned")) {
              console.warn("⚠️ Credit balance fetch failed (RLS policy issue). Disabling auto-refetch.")
              console.warn("💡 This does NOT affect withdraw - withdraw uses $BUMP token balance from blockchain.")
              console.warn("💡 Please update RLS policy in Supabase.")
              sessionStorage.setItem("credit_406_warned", "true")
            }
          }
          
          return {
            balanceWei: "0",
            balanceEth: "0",
            balanceUsd: 0,
            lastUpdated: null,
          }
        }
        
        throw new Error(errorData.error || `Failed to fetch credit balance: ${creditResponse.statusText}`)
      }

      const creditData = await creditResponse.json()
      
      // Debug: Log API response
      console.log("💰 Credit Balance API Response:", creditData)
      
      const balanceWei = creditData.balanceWei || "0"
      const balanceEth = creditData.balanceEth || "0"
      
      console.log("💰 Credit Balance Parsed:", {
        balanceWei,
        balanceEth,
        mainWalletCreditWei: creditData.mainWalletCreditWei,
        botWalletCreditsWei: creditData.botWalletCreditsWei,
        debug: creditData.debug,
      })

      // Fetch ETH price in USD from CoinGecko (real-time)
      // IMPORTANT: ETH price is fetched fresh every time to reflect current market price
      // This ensures credit value in USD follows ETH price fluctuations
      // Use server-side API route to avoid CORS and rate limiting
      let balanceUsd: number | null = null
      try {
        const priceResponse = await fetch("/api/eth-price", {
          headers: {
            Accept: "application/json",
          },
          // Cache for 30 seconds (matches server-side cache)
          next: { revalidate: 30 },
        })

        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          if (priceData.success && typeof priceData.price === "number") {
            const ethPriceUsd = priceData.price
            // Calculate USD value: ETH amount * current ETH price
            balanceUsd = parseFloat(balanceEth) * ethPriceUsd
            console.log(
              `💰 Credit conversion: ${balanceEth} ETH × $${ethPriceUsd.toFixed(2)} = $${balanceUsd.toFixed(2)}${priceData.cached ? " (cached)" : ""}`
            )
          }
        } else {
          const errorData = await priceResponse.json().catch(() => ({}))
          console.warn(
            `⚠️ Failed to fetch ETH price: ${priceResponse.status} ${errorData.error || priceResponse.statusText}`
          )
        }
      } catch (priceError: any) {
        console.warn("⚠️ Failed to fetch ETH price:", priceError.message || priceError)
        // Don't throw - USD conversion is optional, but log for debugging
      }

      const result = {
        balanceWei,
        balanceEth,
        balanceUsd,
        lastUpdated: new Date().toISOString(),
      }
      
      console.log("💰 Credit Balance Final Result:", result)
      
      return result
    },
    enabled: enabled,
    // Fetch strategy: Only fetch when user opens/app opens the app (on mount)
    // Not using constant polling to save API quota
    // - Fetch once when component mounts (app opens)
    // - Refetch when window regains focus (user returns to tab)
    // - Server-side cache (5 minutes) reduces API calls
    refetchInterval: false, // No constant polling - fetch on demand only
    refetchOnMount: true, // Fetch when component mounts (app opens)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnReconnect: true, // Refetch when internet reconnects
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes (matches server cache)
    retry: (failureCount, error: any) => {
      // Don't retry on 406 errors (RLS policy issue)
      const is406Error = 
        error?.code === "406" ||
        error?.message?.includes("406") || 
        error?.message?.includes("Not Acceptable") ||
        error?.details?.includes("406") ||
        String(error).includes("406")
      
      if (is406Error) {
        return false
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
