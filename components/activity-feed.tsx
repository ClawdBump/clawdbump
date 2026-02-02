"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"

interface ActivityItem {
  id: string
  type: "buy" | "sell"
  amount: string
  hash: string
  timestamp: Date
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  isActive: boolean
}

export function ActivityFeed({ activities, isActive }: ActivityFeedProps) {
  return (
    <Card className="glass-card border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Live Activity</h2>
      </div>

      <ScrollArea className="h-64 rounded-lg border border-border bg-secondary/20">
        {activities.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-sm text-muted-foreground">
              {isActive ? "Waiting for transactions..." : "No activity yet. Start bumping to see live transactions."}
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between rounded-md bg-card/50 p-3 transition-colors hover:bg-card/80"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      activity.type === "buy" ? "bg-accent/10" : "bg-destructive/10"
                    }`}
                  >
                    {activity.type === "buy" ? (
                      <TrendingUp className="h-4 w-4 text-accent" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {activity.type === "buy" ? "Bought" : "Sold"} {activity.amount} ETH
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{activity.hash}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{activity.timestamp.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
