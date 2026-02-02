"use client"

import { useReadContract } from "wagmi"
import { base } from "wagmi/chains"
import { formatUnits } from "viem"

/**
 * Fetches $BUMP token balance directly from blockchain
 * 
 * IMPORTANT: This is the actual $BUMP token balance in the user's wallet
 * - Reads directly from ERC20 contract on-chain
 * - Used for withdraw operations (useWithdrawBump)
 * - Independent from credit balance (useCreditBalance)
 * 
 * Credit Balance vs $BUMP Balance:
 * - Credit Balance = ETH value from converting $BUMP (stored in Supabase, for bot services)
 * - $BUMP Balance = Actual $BUMP tokens in wallet (on-chain, for withdraw)
 */

// $BUMP Token Contract Address on Base Network
const BUMP_TOKEN_ADDRESS = "0x94ce728849431818ec9a0cf29bdb24fe413bbb07" as const
const BUMP_DECIMALS = 18

// ERC20 ABI for balanceOf function
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

interface UseBumpBalanceProps {
  address: string | null | undefined
  enabled?: boolean
}

export function useBumpBalance({ address, enabled = true }: UseBumpBalanceProps) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: BUMP_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    chainId: base.id,
    query: {
      enabled: enabled && !!address && address !== "0x000...000",
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  })

  // Format balance from wei to readable format
  // IMPORTANT: For Convert $BUMP to Credit, we only show whole numbers (no decimals)
  const balance = data ? formatUnits(data, BUMP_DECIMALS) : "0"
  const balanceNumber = parseFloat(balance)
  // Round down to nearest integer and format without decimals
  const formattedBalance = Math.floor(balanceNumber).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return {
    balance: data ? BigInt(data.toString()) : 0n,
    formattedBalance,
    isLoading,
    error,
    refetch,
  }
}
