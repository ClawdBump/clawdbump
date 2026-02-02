"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Clock, Fuel, AlertCircle, DollarSign } from "lucide-react"
import { useCreditBalance } from "@/hooks/use-credit-balance"

interface ConfigPanelProps {
  fuelBalance?: number
  credits?: number
  smartWalletAddress?: string | null
  buyAmountUsd?: string
  onBuyAmountChange?: (amount: string) => void
  intervalSeconds?: number
  onIntervalChange?: (seconds: number) => void
  onCreditUpdate?: (options?: any) => Promise<any> | void
  isActive?: boolean
}

export function ConfigPanel({ 
  fuelBalance = 0, 
  credits = 0, 
  smartWalletAddress,
  buyAmountUsd = "0.0001",
  onBuyAmountChange,
  intervalSeconds = 60,
  onIntervalChange,
  onCreditUpdate,
  isActive = false
}: ConfigPanelProps) {
  // Fetch credit balance from database
  const { data: creditData, isLoading: isLoadingCredit } = useCreditBalance(
    smartWalletAddress || null,
    { enabled: !!smartWalletAddress && smartWalletAddress !== "0x000...000" }
  )
  
  const displayCredit = creditData?.balanceUsd ?? credits
  
  const [internalInterval, setInternalInterval] = useState(60)
  const currentInterval = intervalSeconds !== undefined ? intervalSeconds : internalInterval
  const [bumpSpeedSeconds, setBumpSpeedSeconds] = useState([currentInterval])
  
  useEffect(() => {
    if (intervalSeconds !== undefined && intervalSeconds !== bumpSpeedSeconds[0]) {
      setBumpSpeedSeconds([intervalSeconds])
    }
  }, [intervalSeconds])
  
  const handleIntervalChange = (value: number[]) => {
    const seconds = value[0]
    setBumpSpeedSeconds(value)
    if (onIntervalChange) {
      onIntervalChange(seconds)
    } else {
      setInternalInterval(seconds)
    }
  }
  
  const [internalAmount, setInternalAmount] = useState("0.0001")
  
  const amount = buyAmountUsd !== undefined ? buyAmountUsd : internalAmount
  
  const handleAmountChange = (value: string) => {
    if (onBuyAmountChange) {
      onBuyAmountChange(value)
    } else {
      setInternalAmount(value)
    }
  }
  
  const formatInterval = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      if (remainingSeconds === 0) {
        return `${minutes}m`
      }
      return `${minutes}m ${remainingSeconds}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const remainingMinutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${remainingMinutes}m`
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Fuel Status</span>
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-secondary border border-border p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Current Balance</p>
              <p className="font-mono text-lg font-bold text-primary">
                {isLoadingCredit ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `$${displayCredit.toFixed(2)} Credits`
                )}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Deposit ETH or WETH to your Smart Wallet to add credits
              </p>
            </div>
          </div>

          {displayCredit === 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-destructive">NO FUEL DETECTED</p>
                <p className="text-[10px] text-destructive/80 leading-tight">
                  Send ETH / WETH to your Privy Smart Account address to top up Credits for power your bumping automation
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="border border-border bg-card p-4">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <label className="text-sm font-medium text-foreground">Bump Speed</label>
              </div>
              <span className="font-mono text-sm font-semibold text-primary">
                {formatInterval(bumpSpeedSeconds[0])}
              </span>
            </div>
            <Slider
              value={bumpSpeedSeconds}
              onValueChange={handleIntervalChange}
              min={2}
              max={600}
              step={1}
              disabled={isActive}
              className={isActive ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>2s</span>
              <span>Interval</span>
              <span>10m</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Time between each swap execution (Round Robin across 5 wallets)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">Amount per Bump</label>
            </div>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={isActive}
                className="font-mono pr-16 bg-secondary border-border text-foreground"
                step="0.01"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                USD
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Amount in USD per bump transaction (minimum $0.01)
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
