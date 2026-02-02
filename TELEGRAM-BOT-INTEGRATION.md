# Telegram Bot Integration - ClawdBumpbot

## 📋 Overview

Dokumentasi ini menjelaskan bagaimana bot Telegram (ClawdBumpbot) dapat mengetahui apakah user sudah login ke FarBump via Telegram.

---

## 🔄 Flow Integrasi

### 1. **User Login via Telegram di FarBump**

1. User klik "Login via Telegram" di FarBump
2. Privy membuka popup Telegram OAuth
3. User login dengan nomor telepon di popup
4. Privy menangani OAuth callback secara otomatis
5. **Auto-pairing terjadi**: Hook `useTelegramPair` otomatis memanggil `/api/v1/auth/telegram/pair`
6. Mapping Telegram ID → Wallet Address disimpan di database

### 2. **Bot Telegram Check User Status**

Bot Telegram (ClawdBumpbot) dapat memanggil endpoint untuk check apakah user sudah login:

```
GET /api/v1/auth/telegram/check?telegram_id=123456789
```

---

## 🔌 API Endpoints

### 1. **POST /api/v1/auth/telegram/pair**

**Purpose:** Pair Telegram ID dengan Privy user setelah login berhasil

**Request Body:**
```json
{
  "telegram_id": "123456789",
  "telegram_username": "john_doe",
  "wallet_address": "0x...",
  "privy_user_id": "did:privy:...",
  "first_name": "John",
  "last_name": "Doe",
  "photo_url": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Telegram ID paired successfully",
  "data": {
    "id": 1,
    "telegram_id": "123456789",
    "wallet_address": "0x...",
    ...
  }
}
```

**Note:** Endpoint ini dipanggil otomatis oleh hook `useTelegramPair` setelah user login via Telegram.

---

### 2. **GET /api/v1/auth/telegram/check**

**Purpose:** Check apakah Telegram user sudah login ke FarBump

**Query Parameters:**
- `telegram_id` (required): Telegram user ID

**Example:**
```
GET /api/v1/auth/telegram/check?telegram_id=123456789
```

**Response (User sudah login):**
```json
{
  "is_logged_in": true,
  "wallet_address": "0x1234...",
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

## 🤖 Implementasi di Bot Telegram (ClawdBumpbot)

### Example Code untuk Bot Telegram

```typescript
import { Bot, Context } from "grammy"

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)

// Command untuk check apakah user sudah login
bot.command("check", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) {
    await ctx.reply("❌ Tidak dapat mendapatkan Telegram ID")
    return
  }

  try {
    // Call FarBump API to check login status
    const response = await fetch(
      `https://your-farbump-domain.com/api/v1/auth/telegram/check?telegram_id=${telegramId}`
    )
    
    const data = await response.json()
    
    if (data.is_logged_in) {
      await ctx.reply(
        `✅ Anda sudah login ke FarBump!\n\n` +
        `💰 Wallet: ${data.wallet_address}\n` +
        `👤 Username: ${data.telegram_username || "N/A"}\n` +
        `🕐 Last Login: ${new Date(data.last_login_at).toLocaleString()}`
      )
    } else {
      await ctx.reply(
        `❌ Anda belum login ke FarBump.\n\n` +
        `Silakan login di: https://your-farbump-domain.com`
      )
    }
  } catch (error) {
    console.error("Error checking login status:", error)
    await ctx.reply("❌ Error checking login status. Please try again later.")
  }
})

// Auto-check ketika user mengirim pesan
bot.on("message", async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString()
  
  if (!telegramId) return

  try {
    const response = await fetch(
      `https://your-farbump-domain.com/api/v1/auth/telegram/check?telegram_id=${telegramId}`
    )
    
    const data = await response.json()
    
    if (!data.is_logged_in) {
      // User belum login, kirim reminder
      await ctx.reply(
        `👋 Halo! Untuk menggunakan bot ini, silakan login ke FarBump terlebih dahulu:\n\n` +
        `🔗 https://your-farbump-domain.com`
      )
      return
    }
    
    // User sudah login, lanjutkan dengan command bot
    // ... bot logic here
  } catch (error) {
    console.error("Error:", error)
  }
})

bot.start()
```

---

## 📊 Database Schema

### Table: `telegram_user_mappings`

```sql
CREATE TABLE telegram_user_mappings (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  privy_user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `telegram_id` (unique) - untuk lookup cepat
- `wallet_address` - untuk reverse lookup
- `privy_user_id` - untuk Privy integration

---

## 🔧 Setup

### 1. **Database Setup**

Jalankan SQL script:
```bash
# Copy isi dari DATABASE-TELEGRAM-INTEGRATION.sql
# Paste ke Supabase SQL Editor
# Execute
```

### 2. **Frontend Integration**

Hook `useTelegramPair` sudah terintegrasi di `app/page.tsx`. Tidak perlu setup tambahan.

### 3. **Bot Telegram Setup**

1. Buat bot Telegram di BotFather
2. Dapatkan Bot Token
3. Implementasikan code di atas untuk check login status
4. Update `YOUR_FARBUMP_DOMAIN` dengan domain FarBump Anda

---

## 🔍 Troubleshooting

### Masalah: Bot tidak bisa check login status

**Solusi:**
1. Pastikan database table `telegram_user_mappings` sudah dibuat
2. Pastikan user sudah login via Telegram di FarBump
3. Check API endpoint: `GET /api/v1/auth/telegram/check?telegram_id=123456789`
4. Cek Supabase logs untuk error

### Masalah: Auto-pairing tidak terjadi

**Solusi:**
1. Pastikan hook `useTelegramPair` sudah di-import di `app/page.tsx`
2. Check browser console untuk error
3. Pastikan user login via Telegram (bukan Farcaster atau Wallet)
4. Check Privy user.linkedAccounts untuk Telegram account

### Masalah: Telegram ID tidak ditemukan di Privy

**Solusi:**
1. Pastikan user login via Telegram (bukan method lain)
2. Check `user.linkedAccounts` di browser console
3. Pastikan Privy Dashboard - Telegram login method aktif

---

## 📝 Notes

1. **Auto-pairing terjadi sekali** setelah user login via Telegram
2. **Mapping disimpan permanen** di database (kecuali dihapus manual)
3. **Bot dapat check kapan saja** tanpa batasan rate limit (selama tidak abuse)
4. **Last login time** di-update setiap kali user login via Telegram

---

## 🚀 Next Steps

1. **Implementasi di ClawdBumpbot:**
   - Tambahkan command `/check` untuk check login status
   - Auto-check ketika user mengirim pesan
   - Kirim reminder jika user belum login

2. **Enhanced Features:**
   - Bot bisa mengirim notifikasi ke Telegram ketika swap berhasil
   - Bot bisa menampilkan balance dan session status
   - Bot bisa start/stop bot session via Telegram command

---

## 📚 Referensi

- [Privy Documentation - Linked Accounts](https://docs.privy.io/guide/react/user-management/linked-accounts)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Supabase Documentation](https://supabase.com/docs)

