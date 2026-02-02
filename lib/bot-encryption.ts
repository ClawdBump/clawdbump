/**
 * Bot Encryption Utilities
 * 
 * ⚠️ DEPRECATED: This file is no longer used with CDP Server Wallets V2
 * 
 * CDP Server Wallets manage private keys securely in AWS Nitro Enclaves.
 * No manual encryption/decryption is needed.
 * 
 * This file is kept for backward compatibility only.
 * It can be safely deleted after all users migrate to CDP wallets.
 */

import crypto from "crypto"

const ENCRYPTION_KEY = process.env.BOT_ENCRYPTION_KEY || "default-key-change-in-production"
const ALGORITHM = "aes-256-cbc"

/**
 * @deprecated Use CDP Server Wallets instead
 */
export function encryptPrivateKey(privateKey: string): string {
  console.warn("⚠️ encryptPrivateKey is deprecated. Use CDP Server Wallets instead.")
  
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(privateKey, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  return `${iv.toString("hex")}:${encrypted}`
}

/**
 * @deprecated Use CDP Server Wallets instead
 */
export function decryptPrivateKey(encryptedData: string): string {
  console.warn("⚠️ decryptPrivateKey is deprecated. Use CDP Server Wallets instead.")
  
  const [ivHex, encrypted] = encryptedData.split(":")
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32)
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  
  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  
  return decrypted
}
