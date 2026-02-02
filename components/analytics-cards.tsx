"use client"

import { Card } from "@/components/ui/card"
import { Flame, TrendingUp, Activity } from "lucide-react"

interface AnalyticsCardsProps {
  isActive: boolean
}

export function AnalyticsCards({ isActive }: AnalyticsCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card className="border border-border bg-card p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Gas Burn</span>
          </div>
          <div className="space-y-0.5">
            <p className="font-mono text-sm font-semibold text-foreground">0.0024</p>
            <p className="text-xs text-muted-foreground">ETH/hr</p>
          </div>
        </div>
      </Card>

      <Card className="border border-border bg-card p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Impact</span>
          </div>
          <div className="space-y-0.5">
            <p className="font-mono text-sm font-semibold text-primary">+2.4%</p>
            <p className="text-xs text-muted-foreground">24h avg</p>
          </div>
        </div>
      </Card>

      <Card className="border border-border bg-card p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">Health</span>
          </div>
          <div className="space-y-0.5">
            <p className="font-mono text-sm font-semibold text-foreground">{isActive ? "99.9%" : "—"}</p>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
