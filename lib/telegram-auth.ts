import { cookies } from "next/headers"

/**
 * Telegram Authentication Session Data
 */
export interface TelegramAuthSession {
  telegram_id: string
  telegram_username: string | null
  timestamp: number
  expires_at: number
}

/**
 * Get Telegram authentication session from cookie
 * 
 * @returns TelegramAuthSession if valid session exists, null otherwise
 */
export async function getTelegramAuthSession(): Promise<TelegramAuthSession | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("telegram_auth_session")

    if (!sessionCookie || !sessionCookie.value) {
      return null
    }

    const sessionData: TelegramAuthSession = JSON.parse(sessionCookie.value)

    // Check if session has expired
    if (Date.now() > sessionData.expires_at) {
      console.warn("⚠️ Telegram auth session expired")
      return null
    }

    return sessionData
  } catch (error) {
    console.error("❌ Error reading Telegram auth session:", error)
    return null
  }
}

/**
 * Clear Telegram authentication session cookie
 */
export async function clearTelegramAuthSession(): Promise<void> {
  try {
    const cookieStore = await cookies()
    cookieStore.delete("telegram_auth_session")
  } catch (error) {
    console.error("❌ Error clearing Telegram auth session:", error)
  }
}

