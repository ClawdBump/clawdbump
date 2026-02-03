"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Shield, RefreshCw } from "lucide-react"
import { useBlockchainBalance } from "@/hooks/use-blockchain-balance"
import { toast } from "sonner"

interface WalletCardProps {
  fuelBalance?: number
  credits?: number
  walletAddress?: string | null
  isSmartAccountActive?: boolean
  ethPriceUsd?: number // ETH price for USD conversion
}

export function WalletCard({ 
  fuelBalance = 0, 
  credits = 0, 
  walletAddress, 
  isSmartAccountActive = false,
  ethPriceUsd = 3000,
}: WalletCardProps) {
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Privy Smart Wallet address
  const smartWalletAddress = walletAddress || "0x000...000"

  // Fetch balance directly from blockchain (auto-refresh every 10 seconds)
  const { 
    balance: blockchainBalance, 
    isLoading: isLoadingBalance,
    refetch: refetchBalance
  } = useBlockchainBalance(
    smartWalletAddress !== "0x000...000" ? smartWalletAddress : null,
    { 
      enabled: isSmartAccountActive && smartWalletAddress !== "0x000...000",
      refetchInterval: 10000, // Auto-refresh every 10 seconds
      ethPriceUsd,
    }
  )

  // Use blockchain balance if available, otherwise fallback to prop
  const displayCredit = blockchainBalance?.totalUsd ?? credits

  const handleCopy = () => {
    navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Manual refresh - fetch balance from blockchain immediately
   */
  const handleRefreshBalance = async () => {
    if (!smartWalletAddress || smartWalletAddress === "0x000...000" || !isSmartAccountActive) {
      toast.error("Wallet not connected")
      return
    }
    
    setIsRefreshing(true)
    try {
      console.log("🔄 Refreshing balance from blockchain...")
      await refetchBalance()
      
      if (blockchainBalance) {
        const nativeEth = parseFloat(blockchainBalance.nativeEthFormatted)
        const weth = parseFloat(blockchainBalance.wethFormatted)
        const total = parseFloat(blockchainBalance.totalFormatted)
        
        toast.success("Balance updated!", {
          description: `${total.toFixed(4)} ETH total (${nativeEth.toFixed(4)} Native + ${weth.toFixed(4)} WETH) ≈ $${blockchainBalance.totalUsd.toFixed(2)}`,
        })
      }
    } catch (error: any) {
      console.error("Error refreshing balance:", error)
      toast.error("Failed to refresh balance")
    } finally {
      // Keep spinner for 500ms minimum for UX
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  // Show loading/spinner state
  const showSpinner = isLoadingBalance || isRefreshing

  return (
    <Card className="border border-border bg-card p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Smart Wallet</h2>
          <Shield className="h-4 w-4 text-primary" />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Address</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border border-border bg-secondary px-3 py-2">
              <p className="font-mono text-xs text-foreground truncate">
                {smartWalletAddress}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="h-9 w-9 p-0 hover:bg-muted/50"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

      <div className="mt-4">
        <div className="rounded-lg bg-secondary border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Credits</p>
              <p className="font-mono text-sm font-semibold text-primary">
                {showSpinner ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `$${displayCredit.toFixed(2)}`
                )}
              </p>
              {blockchainBalance && !showSpinner && (
                <p className="text-[9px] text-muted-foreground mt-1">
                  {parseFloat(blockchainBalance.nativeEthFormatted).toFixed(4)} Native ETH + {parseFloat(blockchainBalance.wethFormatted).toFixed(4)} WETH
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefreshBalance}
              disabled={showSpinner || !isSmartAccountActive}
              className="h-6 w-6 p-0 hover:bg-muted/50 shrink-0 disabled:opacity-50"
              title="Refresh credit balance from blockchain"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showSpinner ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground mt-2">
            Auto-updates every 10 seconds • On-chain balance
          </p>
        </div>
      </div>
    </div>
    </Card>
  )
}

