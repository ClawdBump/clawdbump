"use client"

import { useState, useEffect, useCallback } from "react"
import { usePublicClient } from "wagmi"
import { formatUnits, type Address } from "viem"
import { BUMP_TOKEN_ADDRESS, BUMP_DECIMALS } from "@/lib/constants"

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

interface ClawdbumpBalanceResult {
  balance: bigint
  balanceFormatted: string
}

interface UseClawdbumpTokenBalanceOptions {
  enabled?: boolean
}

export function useClawdbumpTokenBalance(
  address: string | null | undefined,
  options: UseClawdbumpTokenBalanceOptions = {}
) {
  const { enabled = true } = options
  const publicClient = usePublicClient()

  const [data, setData] = useState<ClawdbumpBalanceResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!enabled || !address || !publicClient) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const normalizedAddress = address.toLowerCase() as Address

      const balance = (await publicClient.readContract({
        address: BUMP_TOKEN_ADDRESS as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [normalizedAddress],
      })) as bigint

      const balanceFormatted = formatUnits(balance, BUMP_DECIMALS)

      setData({
        balance,
        balanceFormatted,
      })
    } catch (err: any) {
      console.error("Failed to fetch $BUMP token balance:", err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [address, enabled, publicClient])

  useEffect(() => {
    if (enabled && address && publicClient) {
      fetchBalance()
    }
  }, [enabled, address, publicClient, fetchBalance])

  return {
    data,
    isLoading,
    error,
    refetch: fetchBalance,
  }
}

