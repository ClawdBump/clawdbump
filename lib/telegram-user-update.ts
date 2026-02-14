/**
 * Utility functions to update Telegram user mappings in the database
 * 
 * These functions allow updating specific fields in the telegram_user_mappings table
 * after initial login, such as owner_address from CDP Bot Wallets.
 */

import { createSupabaseClient } from "./supabase"

export interface UpdateTelegramUserParams {
  telegramId: number | string
  ownerAddress?: string
  isActive?: boolean
  photoUrl?: string
}

/**
 * Update a Telegram user's mapping in the database
 * 
 * @param params - Parameters for updating the user
 * @returns The updated user record or null if not found
 */
export async function updateTelegramUserMapping(
  params: UpdateTelegramUserParams
): Promise<any | null> {
  try {
    const supabase = createSupabaseClient()

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Only include fields that are provided
    if (params.ownerAddress !== undefined) {
      updateData.owner_address = params.ownerAddress.toLowerCase()
    }
    if (params.isActive !== undefined) {
      updateData.is_active = params.isActive
    }
    if (params.photoUrl !== undefined) {
      updateData.photo_url = params.photoUrl
    }

    console.log(
      "[v0] Updating Telegram user mapping for telegram_id:",
      params.telegramId,
      "with data:",
      updateData
    )

    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .update(updateData)
      .eq("telegram_id", String(params.telegramId))
      .select()

    if (error) {
      console.error("[v0] Error updating Telegram user:", error)
      return null
    }

    if (!data || data.length === 0) {
      console.warn("[v0] No user found with telegram_id:", params.telegramId)
      return null
    }

    console.log("[v0] Successfully updated Telegram user:", data[0])
    return data[0]
  } catch (error) {
    console.error("[v0] Error in updateTelegramUserMapping:", error)
    return null
  }
}

/**
 * Update only the owner_address for a Telegram user
 * 
 * @param telegramId - The Telegram user ID
 * @param ownerAddress - The owner/EOA address from CDP Bot Wallet
 * @returns The updated user record or null if not found
 */
export async function updateTelegramUserOwnerAddress(
  telegramId: number | string,
  ownerAddress: string
): Promise<any | null> {
  return updateTelegramUserMapping({
    telegramId,
    ownerAddress,
  })
}

/**
 * Get a Telegram user's mapping from the database
 * 
 * @param telegramId - The Telegram user ID
 * @returns The user record or null if not found
 */
export async function getTelegramUserMapping(
  telegramId: number | string
): Promise<any | null> {
  try {
    const supabase = createSupabaseClient()

    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .select("*")
      .eq("telegram_id", String(telegramId))
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        // Row not found
        return null
      }
      console.error("[v0] Error fetching Telegram user:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("[v0] Error in getTelegramUserMapping:", error)
    return null
  }
}

/**
 * Get a Telegram user's mapping by wallet address
 * 
 * @param walletAddress - The wallet address to look up
 * @returns The user record or null if not found
 */
export async function getTelegramUserByWalletAddress(
  walletAddress: string
): Promise<any | null> {
  try {
    const supabase = createSupabaseClient()

    const { data, error } = await supabase
      .from("telegram_user_mappings")
      .select("*")
      .eq("wallet_address", walletAddress.toLowerCase())
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        // Row not found
        return null
      }
      console.error("[v0] Error fetching Telegram user by wallet:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("[v0] Error in getTelegramUserByWalletAddress:", error)
    return null
  }
}
