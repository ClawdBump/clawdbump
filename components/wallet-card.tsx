"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Shield, RefreshCw } from "lucide-react"
import { useCreditBalance } from "@/hooks/use-credit-balance"

interface WalletCardProps {
  fuelBalance?: number
  credits?: number
  walletAddress?: string | null
  isSmartAccountActive?: boolean
}

export function WalletCard({ fuelBalance = 0, credits = 0, walletAddress, isSmartAccountActive = false }: WalletCardProps) {
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Privy Smart Wallet address
  const smartWalletAddress = walletAddress || "0x000...000"

  // Fetch credit balance from database
  const { 
    data: creditData, 
    isLoading: isLoadingCredit,
    refetch: refetchCredit 
  } = useCreditBalance(
    smartWalletAddress !== "0x000...000" ? smartWalletAddress : null,
    { enabled: isSmartAccountActive && smartWalletAddress !== "0x000...000" }
  )

  // Use credit from database if available, otherwise fallback to prop
  const displayCredit = creditData?.balanceUsd ?? credits

  const handleCopy = () => {
    navigator.clipboard.writeText(smartWalletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefreshBalance = async () => {
    setIsRefreshing(true)
    try {
      await refetchCredit()
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }
  
  const showSpinner = isLoadingCredit || isRefreshing

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Credits</p>
              <p className="font-mono text-sm font-semibold text-primary">
                {isLoadingCredit ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `$${displayCredit.toFixed(2)}`
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
            Deposit ETH or WETH to your Smart Wallet to add credits
          </p>
        </div>
      </div>
    </Card>
  )
}
