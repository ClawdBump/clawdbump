"use client"

import { useEffect } from "react"

/**
 * Telegram Login Widget Component
 * 
 * This component implements Telegram Login Widget STANDARD (not Privy OAuth)
 * which is more reliable and sends confirmation message to user's Telegram.
 * 
 * Usage:
 * ```tsx
 * <TelegramLoginWidget botUsername="farbump_bot" />
 * ```
 * 
 * After user clicks and authorizes, it will call onAuth callback with user data.
 */
interface TelegramLoginWidgetProps {
  botUsername: string
  onAuth?: (user: TelegramUser) => void
  size?: "large" | "medium" | "small"
  radius?: number
  requestAccess?: "write" | null
  usePic?: boolean
}

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export function TelegramLoginWidget({
  botUsername,
  onAuth,
  size = "large",
  radius = 20,
  requestAccess = "write",
  usePic = true,
}: TelegramLoginWidgetProps) {
  useEffect(() => {
    // Load Telegram Widget script
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", size)
    script.setAttribute("data-radius", radius.toString())
    script.setAttribute("data-request-access", requestAccess || "")
    script.setAttribute("data-use-pic", usePic.toString())
    
    // Create callback function
    const callbackName = `onTelegramAuth_${botUsername.replace(/[^a-zA-Z0-9]/g, "_")}`
    
    // Set callback
    ;(window as any)[callbackName] = (user: TelegramUser) => {
      console.log("✅ Telegram auth callback received:", user)
      
      if (onAuth) {
        onAuth(user)
      } else {
        // Default: redirect to pairing endpoint
        const params = new URLSearchParams({
          telegram_id: user.id.toString(),
          ...(user.username && { telegram_username: user.username }),
          ...(user.first_name && { first_name: user.first_name }),
          ...(user.last_name && { last_name: user.last_name }),
          ...(user.photo_url && { photo_url: user.photo_url }),
          auth_date: user.auth_date.toString(),
          hash: user.hash,
        })
        
        window.location.href = `/api/v1/auth/telegram/init?${params.toString()}`
      }
    }
    
    script.setAttribute("data-onauth", callbackName)
    
    // Find container
    const container = document.getElementById("telegram-login-widget-container")
    if (container) {
      container.innerHTML = "" // Clear previous widget
      container.appendChild(script)
    }
    
    return () => {
      // Cleanup
      if ((window as any)[callbackName]) {
        delete (window as any)[callbackName]
      }
    }
  }, [botUsername, size, radius, requestAccess, usePic, onAuth])

  return <div id="telegram-login-widget-container" />
}

