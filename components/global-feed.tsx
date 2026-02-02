"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Zap, TrendingUp, AlertCircle } from "lucide-react"

const globalActivity = [
  { id: 1, type: "trade", token: "PEPE", action: "Bought", amount: "0.5 ETH", user: "0x3a7f...2b8c", time: "Just now" },
  { id: 2, type: "alert", token: "DOGE", action: "Price Alert", amount: "+15%", user: "System", time: "1 min ago" },
  { id: 3, type: "trade", token: "SHIB", action: "Sold", amount: "1.2 ETH", user: "0x9c2e...5d1a", time: "2 mins ago" },
  { id: 4, type: "trend", token: "BONK", action: "Trending", amount: "↑ 234%", user: "Market", time: "5 mins ago" },
  {
    id: 5,
    type: "trade",
    token: "FLOKI",
    action: "Bought",
    amount: "0.3 ETH",
    user: "0x7b4d...8e3f",
    time: "8 mins ago",
  },
]

export function GlobalFeed() {
  return (
    <Card className="glass-card border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Network Activity</h3>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-accent pulse-glow" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {globalActivity.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 rounded-lg bg-secondary/20 p-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  activity.type === "trade"
                    ? "bg-primary/20"
                    : activity.type === "alert"
                      ? "bg-destructive/20"
                      : "bg-accent/20"
                }`}
              >
                {activity.type === "trade" ? (
                  <Zap className="h-4 w-4 text-primary" />
                ) : activity.type === "alert" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-accent" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {activity.token} • {activity.action}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{activity.user}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-accent">{activity.amount}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
