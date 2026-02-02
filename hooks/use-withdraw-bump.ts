"use client"

import { useState } from "react"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { usePublicClient } from "wagmi"
import { parseUnits, isAddress, type Address, encodeFunctionData } from "viem"

const BUMP_TOKEN_ADDRESS = "0x94ce728849431818ec9a0cf29bdb24fe413bbb07" as const
const BUMP_DECIMALS = 18

const ERC20_ABI = [
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

export function useWithdrawBump() {
  const { client: smartWalletClient } = useSmartWallets()
  const publicClient = usePublicClient()
  
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const reset = () => {
    setHash(null)
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
  }

  const withdraw = async (to: string, amount: string) => {
    reset()
    setIsPending(true)

    try {
      // 1. Validasi Smart Wallet
      if (!smartWalletClient) {
        throw new Error("Smart Wallet client not found. Please login again.")
      }

      // 2. Validasi Alamat & Amount
      if (!isAddress(to)) throw new Error("Invalid destination address")
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) throw new Error("Invalid amount")

      // 3. Encode Data Transaksi
      const amountWei = parseUnits(amount, BUMP_DECIMALS)
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to as Address, amountWei],
      })

      console.log("🚀 Starting Gasless Withdrawal...")
      console.log(`📍 Destination: ${to}`)
      console.log(`💰 Amount: ${amount} $BUMP`)

      /**
       * CRITICAL: Menggunakan smartWalletClient.sendTransaction
       * Privy akan otomatis mendeteksi konfigurasi Paymaster di Dashboard
       * dan mengirimkan ini sebagai Sponsored User Operation.
       * 
       * Timeout handling: Paymaster API calls can timeout, so we wrap it with a timeout
       * Coinbase CDP Paymaster API can be slow, so we use longer timeout and more retries
       * 
       * Note: Paymaster API timeout is often due to:
       * 1. Network issues
       * 2. Paymaster service overload
       * 3. Billing configuration issues
       * 4. Domain whitelist issues
       */
      const MAX_RETRIES = 6 // Increased retries for Paymaster API reliability
      const TIMEOUT_MS = 180000 // Increased to 180 seconds (3 minutes) for very slow Paymaster API calls
      
      let txHash: `0x${string}` | null = null
      let lastError: Error | null = null

      // Retry logic with exponential backoff
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            // Exponential backoff: 3s, 6s, 12s, 24s, 48s
            const delay = Math.min(Math.pow(2, attempt) * 1500, 30000) // Cap at 30s
            console.log(`⏳ Waiting ${delay}ms before retry (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }

          console.log(`🔄 Attempt ${attempt + 1}/${MAX_RETRIES + 1}: Sending transaction...`)

          // Wrap sendTransaction with timeout
          let timeoutId: ReturnType<typeof setTimeout> | null = null
          
          const transactionPromise = smartWalletClient.sendTransaction({
            to: BUMP_TOKEN_ADDRESS,
            data: data,
            value: BigInt(0),
          })

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Transaction request timed out after ${TIMEOUT_MS / 1000}s. The Paymaster API may be slow or unavailable. Retrying...`))
            }, TIMEOUT_MS)
          })

          try {
            // Race between transaction and timeout
            txHash = await Promise.race([
              transactionPromise.finally(() => {
                // Clear timeout if transaction completes (success or failure)
                if (timeoutId) {
                  clearTimeout(timeoutId)
                }
              }),
              timeoutPromise.finally(() => {
                // Clear timeout if it fires
                if (timeoutId) {
                  clearTimeout(timeoutId)
                }
              })
            ]) as `0x${string}`
            
            console.log(`✅ Transaction sent successfully on attempt ${attempt + 1}`)
            break // Success, exit retry loop
          } catch (raceError: any) {
            // Ensure timeout is cleared on any error
            if (timeoutId) {
              clearTimeout(timeoutId)
            }
            throw raceError
          }
        } catch (attemptError: any) {
          lastError = attemptError
          console.error(`❌ Withdrawal attempt ${attempt + 1} failed:`, attemptError)
          
          const errorMessage = (attemptError.message || attemptError.toString() || "").toLowerCase()
          const errorDetails = (attemptError.details || attemptError.cause?.details || attemptError.cause?.message || "").toLowerCase()
          const errorName = attemptError.name || attemptError.cause?.name || ""
          // Also check the full error object string representation (safely)
          let errorString = ""
          try {
            errorString = JSON.stringify(attemptError).toLowerCase()
          } catch {
            errorString = String(attemptError).toLowerCase()
          }
          
          // Check if it's a billing configuration error - don't retry these
          const isBillingError = 
            errorMessage.includes("no billing attached") ||
            errorMessage.includes("billing attached to account") ||
            errorMessage.includes("request denied") ||
            errorDetails.includes("no billing attached") ||
            errorDetails.includes("billing attached to account") ||
            errorName === "ResourceUnavailableRpcError"
          
          if (isBillingError) {
            console.error("❌ Paymaster billing not configured - no point retrying")
            throw attemptError // Don't retry billing errors
          }
          
          // Check if it's a timeout or connection error - retry these
          // Paymaster API can timeout with various error messages
          const isTimeout = 
            errorMessage.includes("timeout") || 
            errorMessage.includes("timed out") ||
            errorMessage.includes("took too long") ||
            errorMessage.includes("request took too long") ||
            errorMessage.includes("too long to respond") ||
            errorMessage.includes("connection timed out") ||
            errorMessage.includes("failed to fetch") ||
            errorMessage.includes("network error") ||
            errorDetails.includes("timeout") ||
            errorDetails.includes("took too long") ||
            errorDetails.includes("too long to respond") ||
            errorDetails.includes("connection timed out") ||
            errorDetails.includes("failed to fetch") ||
            errorString.includes("timeout") ||
            errorString.includes("took too long") ||
            errorString.includes("connection timed out") ||
            errorString.includes("err_connection_timed_out") ||
            errorName === "TimeoutError" ||
            errorName === "RequestTimeoutError" ||
            errorName === "HttpRequestError" ||
            (errorName === "TypeError" && errorMessage.includes("Failed to fetch"))
          
          if (isTimeout && attempt < MAX_RETRIES) {
            console.log(`⚠️ Timeout detected, will retry (${attempt + 1}/${MAX_RETRIES})...`)
            continue // Retry
          } else if (attempt >= MAX_RETRIES) {
            // Max retries reached
            console.error(`❌ Max retries (${MAX_RETRIES + 1}) reached. Last error:`, attemptError)
            throw attemptError
          } else {
            // Not a timeout and not max retries, throw error immediately
            throw attemptError
          }
        }
      }

      if (!txHash) {
        throw lastError || new Error("Failed to send transaction after retries")
      }

      console.log("✅ Transaction Sent! Hash:", txHash)
      setHash(txHash)

      // 4. Tunggu Konfirmasi Transaksi (with longer timeout for on-chain confirmation)
      if (publicClient) {
        console.log("⏳ Waiting for on-chain confirmation...")
        try {
          const receipt = await Promise.race([
            publicClient.waitForTransactionReceipt({ hash: txHash }),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error("Transaction confirmation timed out. The transaction may still be pending. Please check the transaction hash on a block explorer."))
              }, 120000) // 2 minutes for on-chain confirmation
            })
          ])
          console.log("🎉 Transaction Confirmed:", receipt)
        } catch (confirmationError: any) {
          // Transaction was sent but confirmation timed out
          // This is not a critical error - transaction may still succeed
          console.warn("⚠️ Confirmation timeout, but transaction was sent:", confirmationError)
          // Don't throw - transaction hash is already set, user can check manually
        }
      }

      setIsSuccess(true)
    } catch (err: any) {
      console.error("❌ Withdrawal Error:", err)
      
      // Menangani pesan error umum agar lebih user-friendly
      let friendlyMessage = err.message || "Transaction failed"
      const errorDetails = err.details || err.cause?.details || ""
      const errorName = err.name || err.cause?.name || ""
      
      // Check for Paymaster billing error
      if (
        friendlyMessage.includes("No billing attached") ||
        friendlyMessage.includes("billing attached to account") ||
        friendlyMessage.includes("request denied") ||
        errorDetails.includes("No billing attached") ||
        errorDetails.includes("billing attached to account") ||
        errorName === "ResourceUnavailableRpcError"
      ) {
        friendlyMessage = "Paymaster billing not configured. Please configure billing for mainnet sponsorship in Coinbase CDP Dashboard. Contact the administrator to set up Paymaster billing."
      } else if (
        friendlyMessage.includes("timeout") || 
        friendlyMessage.includes("timed out") || 
        friendlyMessage.includes("took too long") ||
        friendlyMessage.includes("connection timed out") ||
        friendlyMessage.includes("failed to fetch") ||
        err.name === "TimeoutError" ||
        err.name === "RequestTimeoutError" ||
        err.name === "HttpRequestError"
      ) {
        friendlyMessage = "Transaction request timed out. The Paymaster API may be slow or unavailable. The system will automatically retry up to 6 times. Please wait..."
      } else if (friendlyMessage.includes("insufficient funds")) {
        friendlyMessage = "Insufficient ETH for gas. Check if Paymaster is correctly configured in Privy Dashboard."
      } else if (friendlyMessage.includes("Failed to fetch") || friendlyMessage.includes("network")) {
        friendlyMessage = "Network error. Please check your internet connection or Coinbase CDP domain whitelist."
      } else if (friendlyMessage.includes("User already has an embedded wallet")) {
        friendlyMessage = "Wallet initialization error. Please refresh the page and try again."
      } else if (friendlyMessage.includes("ResourceUnavailable") || friendlyMessage.includes("resource not available")) {
        friendlyMessage = "Paymaster service unavailable. Please check Paymaster configuration in Coinbase CDP Dashboard or contact the administrator."
      }

      setError(new Error(friendlyMessage))
    } finally {
      setIsPending(false)
    }
  }

  return {
    withdraw,
    hash,
    isPending,
    isSuccess,
    error,
    reset,
  }
}
