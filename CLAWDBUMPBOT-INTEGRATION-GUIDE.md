# 🤖 ClawdBumpbot Integration Guide - FarBump

## 📋 Overview

Panduan lengkap untuk mengintegrasikan bot Telegram ClawdBumpbot dengan FarBump. Bot dapat:
- ✅ Check apakah user sudah login ke FarBump
- ✅ Mendapatkan informasi wallet user
- ✅ Check status bot session (running/stopped)
- ✅ Mengirim notifikasi ke user
- ✅ Control bot session (start/stop) via Telegram

---

## 🔄 Flow Integrasi

### **1. User Login via Telegram di FarBump**

```
User → FarBump → Login via Telegram → Privy OAuth → Auto-pairing → Database
```

**Proses:**
1. User login via Telegram di FarBump
2. Privy menangani OAuth dan link Telegram account
3. Hook `useTelegramPair` otomatis memanggil `/api/v1/auth/telegram/pair`
4. Mapping `telegram_id → wallet_address` disimpan di database

### **2. Bot Check User Status**

```
Bot → API Call → FarBump → Database → Response
```

**Proses:**
1. User mengirim pesan ke bot
2. Bot mendapatkan `telegram_id` dari user
3. Bot memanggil API FarBump: `GET /api/v1/auth/telegram/check?telegram_id=123456789`
4. FarBump check database dan return status

---

## 🔌 API Endpoints

### **1. Check Login Status**

**Endpoint:** `GET /api/v1/auth/telegram/check`

**Query Parameters:**
- `telegram_id` (required): Telegram user ID

**Example:**
```bash
GET https://farbump.vercel.app/api/v1/auth/telegram/check?telegram_id=123456789
```

**Response (User sudah login):**
```json
{
  "is_logged_in": true,
  "wallet_address": "0x1234567890abcdef...",
  "telegram_username": "john_doe",
  "last_login_at": "2024-01-01T00:00:00Z"
}
```

**Response (User belum login):**
```json
{
  "is_logged_in": false,
  "message": "User has not logged in to FarBump via Telegram"
}
```

---

### **2. Get Bot Session Status**

**Endpoint:** `GET /api/bot/session?userAddress=0x...`

**Query Parameters:**
- `userAddress` (required): User's Smart Wallet address

**Example:**
```bash
GET https://farbump.vercel.app/api/bot/session?userAddress=0x1234567890abcdef...
```

**Response:**
```json
{
  "session": {
    "id": 1,
    "wallet_address": "0x1234567890abcdef...",
    "status": "running",
    "token_address": "0xe5325a3426eb5b64ecbbd60fcb507ed9ea96eb07",
    "amount_usd": "0.01",
    "interval_seconds": 60,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**Response (No session):**
```json
{
  "session": null
}
```

---

## 🤖 Implementasi di ClawdBumpbot

### **Option 1: Menggunakan Grammy (Recommended)**

```typescript
import { Bot, Context } from "grammy"

const FARBUMP_API_URL = "https://farbump.vercel.app"
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)

// Helper function untuk check login status
async function checkFarBumpLogin(telegramId: string) {
  try {
    const response = await fetch(
      `${FARBUMP_API_URL}/api/v1/auth/telegram/check?telegram_id=${telegramId}`
    )
    return await response.json()
  } catch (error) {
    console.error("Error checking FarBump login:", error)
    return null
  }
}

// Helper function untuk get wallet address dari telegram_id
async function getWalletAddress(telegramId: string): Promise<string | null> {
  const loginStatus = await checkFarBumpLogin(telegramId)
  if (loginStatus?.is_logged_in) {
    return loginStatus.wallet_address
  }
  return null
}

// Helper function untuk get session status
async function getSessionStatus(walletAddress: string) {
  try {
    const response = await fetch(
      `${FARBUMP_API_URL}/api/bot/session?userAddress=${walletAddress}`
    )
    const data = await response.json()
    return data.session
  } catch (error) {
    console.error("Error getting session status:", error)
    return null
  }
}

// Command: /check - Check login status
bot.command("check", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) {
    await ctx.reply("❌ Tidak dapat mendapatkan Telegram ID")
    return
  }

  const loginStatus = await checkFarBumpLogin(telegramId)
  
  if (loginStatus?.is_logged_in) {
    await ctx.reply(
      `✅ **Anda sudah login ke FarBump!**\n\n` +
      `💰 **Wallet:** \`${loginStatus.wallet_address}\`\n` +
      `👤 **Username:** ${loginStatus.telegram_username || "N/A"}\n` +
      `🕐 **Last Login:** ${new Date(loginStatus.last_login_at).toLocaleString("id-ID")}\n\n` +
      `🔗 Login di: ${FARBUMP_API_URL}`
    )
  } else {
    await ctx.reply(
      `❌ **Anda belum login ke FarBump.**\n\n` +
      `Silakan login di FarBump untuk menggunakan bot ini:\n` +
      `🔗 ${FARBUMP_API_URL}\n\n` +
      `Setelah login, bot akan otomatis mengenali Anda!`
    )
  }
})

// Command: /status - Check bot session status
bot.command("status", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) {
    await ctx.reply("❌ Tidak dapat mendapatkan Telegram ID")
    return
  }

  // Check login status first
  const loginStatus = await checkFarBumpLogin(telegramId)
  
  if (!loginStatus?.is_logged_in) {
    await ctx.reply(
      `❌ **Anda belum login ke FarBump.**\n\n` +
      `Silakan login terlebih dahulu:\n` +
      `🔗 ${FARBUMP_API_URL}`
    )
    return
  }

  // Get session status
  const session = await getSessionStatus(loginStatus.wallet_address)
  
  if (!session) {
    await ctx.reply(
      `📊 **Status Bot Session:**\n\n` +
      `❌ **Tidak ada session aktif**\n\n` +
      `Bot belum dijalankan. Silakan start bot di FarBump:\n` +
      `🔗 ${FARBUMP_API_URL}`
    )
    return
  }

  const statusEmoji = session.status === "running" ? "🟢" : "🔴"
  const statusText = session.status === "running" ? "Berjalan" : "Berhenti"
  
  await ctx.reply(
    `📊 **Status Bot Session:**\n\n` +
    `${statusEmoji} **Status:** ${statusText}\n` +
    `💰 **Amount:** $${session.amount_usd} USD\n` +
    `⏱️ **Interval:** ${session.interval_seconds} detik\n` +
    `🪙 **Token:** \`${session.token_address}\`\n` +
    `🕐 **Created:** ${new Date(session.created_at).toLocaleString("id-ID")}\n` +
    `🕐 **Updated:** ${new Date(session.updated_at).toLocaleString("id-ID")}`
  )
})

// Auto-check ketika user mengirim pesan pertama kali
const userChecked = new Set<string>()

bot.on("message", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) return
  
  // Skip jika sudah check sebelumnya
  if (userChecked.has(telegramId)) return
  
  // Check login status
  const loginStatus = await checkFarBumpLogin(telegramId)
  
  if (!loginStatus?.is_logged_in) {
    await ctx.reply(
      `👋 **Halo!**\n\n` +
      `Untuk menggunakan bot ini, silakan login ke FarBump terlebih dahulu:\n` +
      `🔗 ${FARBUMP_API_URL}\n\n` +
      `Setelah login, bot akan otomatis mengenali Anda!`
    )
  } else {
    await ctx.reply(
      `✅ **Selamat datang kembali!**\n\n` +
      `Anda sudah login ke FarBump.\n` +
      `Gunakan /status untuk melihat status bot session.`
    )
  }
  
  userChecked.add(telegramId)
})

// Start bot
bot.start()
console.log("🤖 ClawdBumpbot started!")
```

---

### **Option 2: Menggunakan Telegraf**

```typescript
import { Telegraf, Context } from "telegraf"

const FARBUMP_API_URL = "https://farbump.vercel.app"
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

// Helper functions (sama seperti di atas)
async function checkFarBumpLogin(telegramId: string) {
  try {
    const response = await fetch(
      `${FARBUMP_API_URL}/api/v1/auth/telegram/check?telegram_id=${telegramId}`
    )
    return await response.json()
  } catch (error) {
    console.error("Error checking FarBump login:", error)
    return null
  }
}

// Command: /check
bot.command("check", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) {
    await ctx.reply("❌ Tidak dapat mendapatkan Telegram ID")
    return
  }

  const loginStatus = await checkFarBumpLogin(telegramId)
  
  if (loginStatus?.is_logged_in) {
    await ctx.reply(
      `✅ Anda sudah login ke FarBump!\n\n` +
      `💰 Wallet: ${loginStatus.wallet_address}\n` +
      `👤 Username: ${loginStatus.telegram_username || "N/A"}\n` +
      `🕐 Last Login: ${new Date(loginStatus.last_login_at).toLocaleString("id-ID")}`
    )
  } else {
    await ctx.reply(
      `❌ Anda belum login ke FarBump.\n\n` +
      `Silakan login di: ${FARBUMP_API_URL}`
    )
  }
})

// Start bot
bot.launch()
console.log("🤖 ClawdBumpbot started!")
```

---

## 🚀 Advanced Features

### **1. Notifikasi Swap Berhasil**

Bot bisa mengirim notifikasi ke user ketika swap berhasil. Implementasi di FarBump:

**File:** `app/api/bot/notify/route.ts` (create new file)

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  try {
    const { wallet_address, message } = await request.json()
    
    // Get telegram_id from wallet_address
    const supabase = createSupabaseServiceClient()
    const { data } = await supabase
      .from("telegram_user_mappings")
      .select("telegram_id")
      .eq("wallet_address", wallet_address)
      .eq("is_active", true)
      .single()
    
    if (!data) {
      return NextResponse.json({ success: false, message: "User not found" })
    }
    
    // Send notification via Telegram Bot API
    const botToken = process.env.TELEGRAM_BOT_TOKEN!
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.telegram_id,
        text: message,
      }),
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error sending notification:", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
```

**Usage di Railway Worker:**
```typescript
// Setelah swap berhasil
await fetch("https://farbump.vercel.app/api/bot/notify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    wallet_address: userWallet,
    message: `✅ Swap berhasil! Amount: $${amountUsd} USD`,
  }),
})
```

---

### **2. Bot Command untuk Start/Stop Session**

**Endpoint:** `POST /api/bot/session` (create new endpoint atau extend existing)

```typescript
// Di ClawdBumpbot
bot.command("start", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  const walletAddress = await getWalletAddress(telegramId)
  
  if (!walletAddress) {
    await ctx.reply("❌ Anda belum login ke FarBump")
    return
  }
  
  // Call FarBump API to start session
  // (Implementasi endpoint start session via Telegram)
})

bot.command("stop", async (ctx: Context) => {
  // Similar implementation
})
```

---

## 📋 Setup Checklist

### **1. Database Setup**

- [ ] Table `telegram_user_mappings` sudah dibuat di Supabase
- [ ] RLS policies sudah dikonfigurasi
- [ ] Indexes sudah dibuat untuk performa

**SQL Script:** `DATABASE-TELEGRAM-INTEGRATION.sql`

### **2. FarBump API Endpoints**

- [ ] Endpoint `/api/v1/auth/telegram/check` sudah tersedia
- [ ] Endpoint `/api/v1/auth/telegram/pair` sudah tersedia
- [ ] Endpoint `/api/bot/session` sudah tersedia

### **3. ClawdBumpbot Setup**

- [ ] Bot token sudah dikonfigurasi
- [ ] Helper functions sudah diimplementasikan
- [ ] Commands sudah dibuat (`/check`, `/status`)
- [ ] Auto-check login status sudah diimplementasikan

### **4. Testing**

- [ ] Test login via Telegram di FarBump
- [ ] Test bot command `/check`
- [ ] Test bot command `/status`
- [ ] Test auto-check ketika user mengirim pesan

---

## 🔍 Troubleshooting

### **Masalah: Bot tidak bisa check login status**

**Solusi:**
1. Pastikan `FARBUMP_API_URL` benar di bot code
2. Pastikan endpoint `/api/v1/auth/telegram/check` accessible
3. Check network logs di bot server
4. Pastikan `telegram_id` format benar (numeric string)

### **Masalah: User sudah login tapi bot tidak mengenali**

**Solusi:**
1. Pastikan user login via Telegram (bukan Farcaster/Wallet)
2. Check database table `telegram_user_mappings`
3. Pastikan `is_active = true`
4. Check Privy Dashboard - Telegram login method aktif

### **Masalah: Bot tidak bisa get session status**

**Solusi:**
1. Pastikan `wallet_address` benar
2. Check endpoint `/api/bot/session` accessible
3. Pastikan user sudah start bot session di FarBump

---

## 📚 Referensi

- [Grammy Documentation](https://grammy.dev/)
- [Telegraf Documentation](https://telegraf.js.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [FarBump API Documentation](./TELEGRAM-BOT-INTEGRATION.md)

---

## 🎯 Next Steps

1. **Implementasi di ClawdBumpbot:**
   - Tambahkan helper functions
   - Implementasikan commands (`/check`, `/status`)
   - Test dengan user yang sudah login

2. **Advanced Features:**
   - Notifikasi swap berhasil
   - Bot command untuk start/stop session
   - Display balance dan credit info

3. **Integration Testing:**
   - Test end-to-end flow
   - Test error handling
   - Test dengan multiple users

