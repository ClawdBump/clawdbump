"use client"

import { useState, useEffect, useCallback } from "react"
import { usePublicClient } from "wagmi"
import { formatEther, type Address } from "viem"

// WETH Contract on Base
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const

const WETH_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

interface BlockchainBalance {
  nativeEth: bigint
  weth: bigint
  total: bigint
  nativeEthFormatted: string
  wethFormatted: string
  totalFormatted: string
  totalUsd: number
}

interface UseBlockchainBalanceOptions {
  enabled?: boolean
  refetchInterval?: number // Auto-refetch every N milliseconds (default: 10000ms = 10s)
  ethPriceUsd?: number // ETH price for USD conversion
}

/**
 * Hook to fetch real-time balance directly from blockchain
 * This is more accurate than database balance and auto-syncs
 * 
 * Usage:
 * const { balance, isLoading, refetch } = useBlockchainBalance(address, {
 *   enabled: true,
 *   refetchInterval: 10000, // Refetch every 10 seconds
 *   ethPriceUsd: 3000,
 * })
 */
export function useBlockchainBalance(
  address: string | null | undefined,
  options: UseBlockchainBalanceOptions = {}
) {
  const {
    enabled = true,
    refetchInterval = 10000, // 10 seconds default
    ethPriceUsd = 3000, // Default ETH price
  } = options

  const publicClient = usePublicClient()
  
  const [balance, setBalance] = useState<BlockchainBalance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchBalance = useCallback(async () => {
    if (!address || !publicClient || !enabled) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const normalizedAddress = address.toLowerCase() as Address

      // Fetch Native ETH balance
      const nativeEthBalance = await publicClient.getBalance({
        address: normalizedAddress,
      })

      // Fetch WETH balance
      let wethBalance = BigInt(0)
      try {
        wethBalance = (await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: WETH_ABI,
          functionName: "balanceOf",
          args: [normalizedAddress],
        })) as bigint
      } catch (wethError) {
        console.warn("Failed to fetch WETH balance:", wethError)
        // Continue with 0 WETH balance
      }

      // Calculate totals
      const totalBalance = nativeEthBalance + wethBalance
      const nativeEthFormatted = formatEther(nativeEthBalance)
      const wethFormatted = formatEther(wethBalance)
      const totalFormatted = formatEther(totalBalance)
      const totalUsd = parseFloat(totalFormatted) * ethPriceUsd

      const balanceData: BlockchainBalance = {
        nativeEth: nativeEthBalance,
        weth: wethBalance,
        total: totalBalance,
        nativeEthFormatted,
        wethFormatted,
        totalFormatted,
        totalUsd,
      }

      setBalance(balanceData)
    } catch (err: any) {
      console.error("Error fetching blockchain balance:", err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [address, publicClient, enabled, ethPriceUsd])

  // Initial fetch
  useEffect(() => {
    if (enabled && address && publicClient) {
      fetchBalance()
    }
  }, [enabled, address, publicClient, fetchBalance])

  // Auto-refetch interval
  useEffect(() => {
    if (!enabled || !address || !publicClient || !refetchInterval) {
      return
    }

    const intervalId = setInterval(() => {
      fetchBalance()
    }, refetchInterval)

    return () => clearInterval(intervalId)
  }, [enabled, address, publicClient, refetchInterval, fetchBalance])

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
  }
}

/**
 * Hook to fetch TOTAL balance (main wallet + 5 bot wallets) from blockchain
 * This gives complete picture of user's available balance
 * 
 * Usage:
 * const { totalBalance, mainBalance, botBalances, refetch } = useTotalBlockchainBalance({
 *   mainWalletAddress,
 *   botWalletAddresses: ['0x...', '0x...', ...],
 *   enabled: true,
 * })
 */
export function useTotalBlockchainBalance(options: {
  mainWalletAddress: string | null | undefined
  botWalletAddresses?: string[] | null
  enabled?: boolean
  refetchInterval?: number
  ethPriceUsd?: number
}) {
  const {
    mainWalletAddress,
    botWalletAddresses = [],
    enabled = true,
    refetchInterval = 10000,
    ethPriceUsd = 3000,
  } = options

  const publicClient = usePublicClient()
  
  const [mainBalance, setMainBalance] = useState<BlockchainBalance | null>(null)
  const [botBalances, setBotBalances] = useState<BlockchainBalance[]>([])
  const [totalBalance, setTotalBalance] = useState<BlockchainBalance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchAllBalances = useCallback(async () => {
    if (!mainWalletAddress || !publicClient || !enabled) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Fetch main wallet balance
      const mainAddr = mainWalletAddress.toLowerCase() as Address
      const mainNativeEth = await publicClient.getBalance({ address: mainAddr })
      
      let mainWeth = BigInt(0)
      try {
        mainWeth = (await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: WETH_ABI,
          functionName: "balanceOf",
          args: [mainAddr],
        })) as bigint
      } catch {}

      const mainBalanceData: BlockchainBalance = {
        nativeEth: mainNativeEth,
        weth: mainWeth,
        total: mainNativeEth + mainWeth,
        nativeEthFormatted: formatEther(mainNativeEth),
        wethFormatted: formatEther(mainWeth),
        totalFormatted: formatEther(mainNativeEth + mainWeth),
        totalUsd: parseFloat(formatEther(mainNativeEth + mainWeth)) * ethPriceUsd,
      }
      setMainBalance(mainBalanceData)

      // Fetch bot wallet balances
      const botBalancesData: BlockchainBalance[] = []
      let totalNativeEth = mainNativeEth
      let totalWeth = mainWeth

      if (botWalletAddresses && botWalletAddresses.length > 0) {
        for (const botAddr of botWalletAddresses) {
          if (!botAddr) continue
          
          const addr = botAddr.toLowerCase() as Address
          const nativeEth = await publicClient.getBalance({ address: addr })
          
          let weth = BigInt(0)
          try {
            weth = (await publicClient.readContract({
              address: WETH_ADDRESS,
              abi: WETH_ABI,
              functionName: "balanceOf",
              args: [addr],
            })) as bigint
          } catch {}

          botBalancesData.push({
            nativeEth,
            weth,
            total: nativeEth + weth,
            nativeEthFormatted: formatEther(nativeEth),
            wethFormatted: formatEther(weth),
            totalFormatted: formatEther(nativeEth + weth),
            totalUsd: parseFloat(formatEther(nativeEth + weth)) * ethPriceUsd,
          })

          totalNativeEth += nativeEth
          totalWeth += weth
        }
      }
      setBotBalances(botBalancesData)

      // Calculate grand total
      const grandTotal = totalNativeEth + totalWeth
      const totalBalanceData: BlockchainBalance = {
        nativeEth: totalNativeEth,
        weth: totalWeth,
        total: grandTotal,
        nativeEthFormatted: formatEther(totalNativeEth),
        wethFormatted: formatEther(totalWeth),
        totalFormatted: formatEther(grandTotal),
        totalUsd: parseFloat(formatEther(grandTotal)) * ethPriceUsd,
      }
      setTotalBalance(totalBalanceData)

    } catch (err: any) {
      console.error("Error fetching total blockchain balance:", err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [mainWalletAddress, botWalletAddresses, publicClient, enabled, ethPriceUsd])

  // Initial fetch
  useEffect(() => {
    if (enabled && mainWalletAddress && publicClient) {
      fetchAllBalances()
    }
  }, [enabled, mainWalletAddress, publicClient, fetchAllBalances])

  // Auto-refetch interval
  useEffect(() => {
    if (!enabled || !mainWalletAddress || !publicClient || !refetchInterval) {
      return
    }

    const intervalId = setInterval(() => {
      fetchAllBalances()
    }, refetchInterval)

    return () => clearInterval(intervalId)
  }, [enabled, mainWalletAddress, publicClient, refetchInterval, fetchAllBalances])

  return {
    mainBalance,
    botBalances,
    totalBalance,
    isLoading,
    error,
    refetch: fetchAllBalances,
  }
}

