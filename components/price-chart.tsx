"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { BarChart3, ExternalLink } from "lucide-react"
import { isAddress } from "viem"

interface PriceChartProps {
  tokenAddress?: string | null
}

export function PriceChart({ tokenAddress }: PriceChartProps) {
  // DexScreener embed URL for Base network
  const getDexScreenerUrl = (address: string) => {
    if (!address || !isAddress(address)) return null
    // DexScreener widget URL for Base network
    return `https://dexscreener.com/base/${address}?embed=1&theme=dark&trades=0&info=0`
  }

  // CRITICAL: Use useMemo to prevent chart from reloading/flickering on tab switches
  // This ensures chart URL is stable and only changes when tokenAddress actually changes
  const chartUrl = useMemo(() => {
    return tokenAddress ? getDexScreenerUrl(tokenAddress) : null
  }, [tokenAddress])

  return (
    <Card className="border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Live Price Chart</h3>
        </div>
        {chartUrl && (
          <a
            href={`https://dexscreener.com/base/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <span>View on DexScreener</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="relative h-[400px] overflow-hidden rounded-lg bg-secondary border border-border">
        {chartUrl ? (
          <iframe
            src={chartUrl}
            className="w-full h-full border-0"
            title="DexScreener Price Chart"
            allow="clipboard-read; clipboard-write"
            style={{ minHeight: "400px" }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <BarChart3 className="h-8 w-8 opacity-50" />
              <p className="text-xs">Enter a token address to view chart</p>
              <p className="text-xs font-mono text-muted-foreground/60">Powered by DexScreener</p>
            </div>
          </div>
        )}
      </div>

      {tokenAddress && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Token: {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}</span>
          <span className="font-mono">Base Network</span>
        </div>
      )}
    </Card>
  )
}
