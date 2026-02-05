"use client"

import { Button } from "@/components/ui/button"
import { Play, Square, Lock, Loader2 } from "lucide-react"

interface ActionButtonProps {
  isActive: boolean
  onToggle: () => void
  onGenerateWallets?: () => void | Promise<void>
  credits?: number
  balanceWei?: string | null
  isVerified?: boolean
  buyAmountUsd?: string
  loadingState?: string | null
  isLoadingWallets?: boolean
  hasBotWallets?: boolean
  overrideLabel?: string // Menambahkan dukungan overrideLabel dari page.tsx
}

export function ActionButton({ 
  isActive, 
  onToggle,
  onGenerateWallets,
  credits = 0,
  balanceWei = null, 
  isVerified = false,
  buyAmountUsd = "0",
  loadingState = null,
  isLoadingWallets = false,
  hasBotWallets = false,
  overrideLabel
}: ActionButtonProps) {
  
  // Perbaikan Logika: Tombol dianggap memiliki akses jika:
  // 1. Sedang aktif (untuk stop)
  // 2. Jika belum aktif, cukup pastikan token sudah diverifikasi
  const hasCredit = balanceWei ? BigInt(balanceWei) > BigInt(0) : credits > 0
  
  // Kita buat tombol bisa diklik meskipun saldo 0, 
  // agar fungsi handleToggle di page.tsx bisa memberikan pesan error yang jelas (toast)
  const isLocked = !isActive && !isVerified
  const isLoading = !!loadingState || isLoadingWallets
  
  const getButtonText = () => {
    if (isActive) return overrideLabel || "Stop Bumping"
    if (isLoading) return loadingState || "Processing..."
    if (!isVerified) return "Verify Token First"
    if (!hasCredit && !isActive) return "Start Bumping" // Biarkan user klik, lalu munculkan toast saldo kurang
    
    return overrideLabel || "Start Bumping"
  }
  
  const isButtonDisabled = isLocked || isLoading
  
  const handleClick = () => {
    if (isButtonDisabled) return
    
    // Tetap pertahankan fungsionalitas generate wallets jika diperlukan
    if (!isActive && !hasBotWallets && hasCredit && onGenerateWallets) {
      onGenerateWallets()
    } else {
      onToggle()
    }
  }

  return (
    <Button
      size="lg"
      onClick={handleClick}
      disabled={isButtonDisabled}
      className={`w-full h-14 text-base font-semibold transition-all ${
        isButtonDisabled
          ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          : isActive
            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
            : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
      }`}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {getButtonText()}
        </>
      ) : isLocked ? (
        <>
          <Lock className="mr-2 h-5 w-5" />
          {getButtonText()}
        </>
      ) : isActive ? (
        <>
          <Square className="mr-2 h-5 w-5 fill-current" />
          {getButtonText()}
        </>
      ) : (
        <>
          <Play className="mr-2 h-5 w-5 fill-current" />
          {getButtonText()}
        </>
      )}
    </Button>
  )
}
