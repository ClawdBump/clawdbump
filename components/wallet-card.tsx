"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Shield, RefreshCw } from "lucide-react"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { useSyncBotBalances } from "@/hooks/use-sync-bot-balances"
import { usePublicClient } from "wagmi"
import { formatEther, isAddress, encodeFunctionData, type Address, type Hex } from "viem"
import { toast } from "sonner"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { CLAWDBUMP_TOKEN_ADDRESS } from "@/lib/constants"

interface WalletCardProps {
  fuelBalance?: number
  credits?: number
  walletAddress?: string | null
  isSmartAccountActive?: boolean
  ethPriceUsd?: number
  clawdbumpBalance?: { balance: bigint; balanceFormatted: string } | null
  isLoadingClawdbump?: boolean
  onRefreshClawdbump?: () => void
}

export function WalletCard({
  fuelBalance = 0,
  credits = 0,
  walletAddress,
  isSmartAccountActive = false,
  ethPriceUsd,
  clawdbumpBalance,
  isLoadingClawdbump = false,
  onRefreshClawdbump,
}: WalletCardProps) {
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [withdrawAddress, setWithdrawAddress] = useState("")
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const publicClient = usePublicClient()
  const { client: smartWalletClient } = useSmartWallets()
  
  // Privy Smart Wallet address
  const smartWalletAddress = walletAddress || "0x000...000"

  // Fetch credit balance from database (main wallet + 5 bot wallets)
  const { 
    data: creditData, 
    isLoading: isLoadingCredit,
    refetch: refetchCredit 
  } = useCreditBalance(
    smartWalletAddress !== "0x000...000" ? smartWalletAddress : null,
    { enabled: isSmartAccountActive && smartWalletAddress !== "0x000...000" }
  )

  // Sync bot balances hook
  const { syncBalances, isSyncing } = useSyncBotBalances()

  // Use credit from database if available, otherwise fallback to prop
  const displayCredit = creditData?.balanceUsd ?? credits

  // Minimal ERC20 ABI for transfer
  const ERC20_ABI = [
    {
      inputs: [
        { name: "_to", type: "address" },
        { name: "_value", type: "uint256" },
      ],
      name: "transfer",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function",
    },
  ] as const

  const handleWithdrawClawdbump = async () => {
    if (!smartWalletClient || !smartWalletAddress || smartWalletAddress === "0x000...000") {
      toast.error("Wallet not connected")
      return
    }

    if (!withdrawAddress || !isAddress(withdrawAddress)) {
      toast.error("Invalid recipient address")
      return
    }

    if (!clawdbumpBalance || clawdbumpBalance.balance === 0n) {
      toast.error("No $CLAWDBUMP balance to withdraw")
      return
    }

    setIsWithdrawing(true)
    try {
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [withdrawAddress as Address, clawdbumpBalance.balance],
      })

      const txHash = await smartWalletClient.sendTransaction({
        to: CLAWDBUMP_TOKEN_ADDRESS as Address,
        data: transferData as Hex,
        value: 0n,
      }) as `0x${string}`

      toast.success("Withdraw submitted", {
        description: `Transaction: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
      })
    } catch (error: any) {
      console.error("Failed to withdraw $CLAWDBUMP:", error)
      toast.error("Failed to withdraw $CLAWDBUMP", {
        description: error?.message || "Unknown error",
      })
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Fetch ETH/WETH balance from blockchain and sync with database
   * Juga memicu refresh saldo token $CLAWDBUMP melalui callback dari parent
   */
  const handleRefreshBalance = async () => {
    if (!smartWalletAddress || smartWalletAddress === "0x000...000" || !isSmartAccountActive) {
      toast.error("Wallet not connected")
      return
    }
    
    setIsRefreshing(true)
    try {
      console.log("🔄 Fetching balance from blockchain and syncing bot wallets...")
      
      // Step 1: Sync all bot wallet credits with on-chain balance
      console.log("   → Syncing bot wallet credits...")
      const syncResult = await syncBalances(smartWalletAddress)
      
      if (syncResult && syncResult.synced > 0) {
        console.log(`   ✅ Synced ${syncResult.synced} bot wallet(s)`)
      }
      
      // Step 2: Fetch main wallet balance from blockchain
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
      
      if (!publicClient) {
        throw new Error("Public client not initialized")
      }
      
      // Fetch Native ETH balance
      const nativeEthBalance = await publicClient.getBalance({
        address: smartWalletAddress as `0x${string}`,
      })
      
      // Fetch WETH balance
      let wethBalance = BigInt(0)
      try {
        wethBalance = await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: WETH_ABI,
          functionName: "balanceOf",
          args: [smartWalletAddress as `0x${string}`],
        }) as bigint
      } catch (error) {
        console.warn("Failed to fetch WETH balance:", error)
      }
      
      // Total on-chain balance
      const totalOnChainBalanceWei = nativeEthBalance + wethBalance
      const totalEth = formatEther(totalOnChainBalanceWei)
      
      console.log(`✅ On-chain balance: ${totalEth} ETH (${formatEther(nativeEthBalance)} Native + ${formatEther(wethBalance)} WETH)`)
      
      // Step 3: Sync main wallet with database if needed
      try {
        const syncResponse = await fetch("/api/credit/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: smartWalletAddress,
            syncOnly: true, // Only sync, don't add
          }),
        })
        
        const syncData = await syncResponse.json()
        
        if (syncResponse.ok && syncData.success) {
          console.log("✅ Main wallet database synced with on-chain balance")
        } else {
          console.warn("Failed to sync main wallet database:", syncData.error)
        }
      } catch (syncError: any) {
        console.error("Failed to sync main wallet with database:", syncError)
      }
      
      // Step 4: Refetch credit from database to get updated balance (main + bot wallets)
      await refetchCredit()
      // Also refresh $CLAWDBUMP token balance displayed in this card
      if (onRefreshClawdbump) {
        onRefreshClawdbump()
      }
      
      toast.success("Balance updated!", {
        description: `Main wallet: ${totalEth} ETH • ${syncResult?.synced || 0} bot wallet(s) synced`,
      })
      
    } catch (error: any) {
      console.error("❌ Failed to refresh balance:", error)
      toast.error("Failed to refresh balance", {
        description: error.message || "Unknown error",
      })
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const showSpinner = isLoadingCredit || isRefreshing || isSyncing || isLoadingClawdbump

  return (
    <Card className="border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-foreground">Privy Smart Wallet</p>
              {isSmartAccountActive && (
                <span className="inline-flex items-center rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Smart Account Active
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-foreground break-all">{smartWalletAddress || "0x000...000"}</p>
            <p className="text-[10px] leading-tight text-muted-foreground pt-0.5">
              Dedicated secure wallet for ClawdBump automation on Base Network.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="shrink-0 h-8 w-8 p-0 hover:bg-muted" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>

      <div className="mt-4">
        <div className="rounded-lg bg-secondary border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">$CLAWDBUMP</p>
              <p className="font-mono text-sm font-semibold text-primary">
                {showSpinner ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `${clawdbumpBalance ? Number(clawdbumpBalance.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"} $CLAWDBUMP`
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefreshBalance}
              disabled={showSpinner || !isSmartAccountActive}
              className="h-6 w-6 p-0 hover:bg-muted/50 shrink-0 disabled:opacity-50"
              title="Refresh credit balance"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showSpinner ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground mt-2">
            Deposit and hold minimum 50M $CLAWDBUMP token to your Smart Wallet to start using the bot
          </p>

          <div className="mt-3 space-y-1">
            <p className="text-[9px] text-muted-foreground">Withdraw $CLAWDBUMP to your own address</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0xRecipientAddress..."
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-[10px] font-semibold"
                disabled={
                  isWithdrawing ||
                  !isSmartAccountActive ||
                  !withdrawAddress ||
                  !clawdbumpBalance ||
                  clawdbumpBalance.balance === 0n
                }
                onClick={handleWithdrawClawdbump}
              >
                {isWithdrawing ? "Withdrawing..." : "Withdraw"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

