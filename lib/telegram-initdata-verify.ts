import crypto from "crypto"

/**
 * Verify Telegram WebApp initData using HMAC-SHA256
 * 
 * Based on Telegram documentation:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * Algorithm:
 * 1. Parse initData string (format: key=value&key=value&hash=...)
 * 2. Extract hash from initData
 * 3. Remove hash from initData
 * 4. Sort parameters alphabetically
 * 5. Create data_check_string: key=value\nkey=value...
 * 6. Create secret_key: HMAC-SHA256(bot_token, "WebAppData")
 * 7. Calculate hash: HMAC-SHA256(data_check_string, secret_key)
 * 8. Compare calculated hash with provided hash
 * 
 * @param initData - Raw initData string from window.Telegram.WebApp.initData
 * @param botToken - Telegram bot token from BotFather
 * @returns Object with isValid flag and parsed data
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { isValid: boolean; data?: Record<string, string>; error?: string } {
  try {
    console.log("🔍 [VERIFY-UTIL] Starting initData verification...")
    if (!initData || !botToken) {
      console.error("❌ [VERIFY-UTIL] Missing required parameters")
      return {
        isValid: false,
        error: "Missing required parameters: initData and botToken",
      }
    }

    // Parse initData string
    // Format: key=value&key=value&hash=abc123...
    const params = new URLSearchParams(initData)
    const providedHash = params.get("hash")

    if (!providedHash) {
      return {
        isValid: false,
        error: "Missing hash in initData",
      }
    }

    // Remove hash from params
    params.delete("hash")

    // Sort parameters alphabetically
    const sortedKeys = Array.from(params.keys()).sort()

    // Create data_check_string: key=value\nkey=value...
    const dataCheckString = sortedKeys
      .map((key) => `${key}=${params.get(key)}`)
      .join("\n")

    // Create secret_key: HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest()

    // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex")

    // Compare hashes
    const isValid = calculatedHash === providedHash

    console.log("🔍 [VERIFY-UTIL] Hash comparison:", {
      calculatedHash: calculatedHash.substring(0, 16) + "...",
      providedHash: providedHash.substring(0, 16) + "...",
      isValid,
    })

    if (!isValid) {
      console.error("❌ [VERIFY-UTIL] Hash mismatch - initData may be tampered with")
      return {
        isValid: false,
        error: "Invalid hash - initData may be tampered with",
      }
    }

    console.log("✅ [VERIFY-UTIL] Hash verification successful!")

    // Parse user data from initData
    const data: Record<string, string> = {}
    sortedKeys.forEach((key) => {
      data[key] = params.get(key) || ""
    })

    // Parse user object if present
    if (data.user) {
      try {
        data.user = JSON.parse(data.user)
      } catch (e) {
        // user is already a string, keep as is
      }
    }

    return {
      isValid: true,
      data,
    }
  } catch (error: any) {
    console.error("❌ Error verifying Telegram initData:", error)
    return {
      isValid: false,
      error: error.message || "Failed to verify initData",
    }
  }
}

/**
 * Extract Telegram user ID from verified initData
 * 
 * @param data - Parsed data from verifyTelegramInitData
 * @returns Telegram user ID or null
 */
export function extractTelegramId(
  data: Record<string, string>
): string | null {
  try {
    // User data can be in different formats:
    // 1. Direct user object: data.user = { id: 123456789, ... }
    // 2. JSON string: data.user = '{"id": 123456789, ...}'
    // 3. Already parsed: data.user = { id: 123456789, ... }

    if (!data.user) {
      return null
    }

    let userData: any
    if (typeof data.user === "string") {
      try {
        userData = JSON.parse(data.user)
      } catch (e) {
        // If parsing fails, user might be in different format
        return null
      }
    } else {
      userData = data.user
    }

    // Extract telegram_id from user object
    const telegramId = userData.id?.toString() || userData.telegram_id?.toString() || null

    return telegramId
  } catch (error: any) {
    console.error("❌ Error extracting Telegram ID:", error)
    return null
  }
}

/**
 * Extract additional user data from verified initData
 * 
 * @param data - Parsed data from verifyTelegramInitData
 * @returns User data object
 */
export function extractUserData(data: Record<string, string>): {
  telegram_id: string | null
  username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
} {
  try {
    let userData: any
    if (typeof data.user === "string") {
      try {
        userData = JSON.parse(data.user)
      } catch (e) {
        userData = {}
      }
    } else {
      userData = data.user || {}
    }

    return {
      telegram_id: userData.id?.toString() || null,
      username: userData.username || null,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      photo_url: userData.photo_url || null,
    }
  } catch (error: any) {
    console.error("❌ Error extracting user data:", error)
    return {
      telegram_id: null,
      username: null,
      first_name: null,
      last_name: null,
      photo_url: null,
    }
  }
}

