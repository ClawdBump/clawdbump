# 🔄 Telegram Seamless Login Implementation - Based on Privy Docs

## 📋 Overview

Implementasi seamless Telegram login berdasarkan dokumentasi Privy: https://docs.privy.io/recipes/react/seamless-telegram

**Key Points dari Privy Documentation:**
- Privy akan **otomatis login user** ketika user initiate login dari dalam Telegram bot atau Telegram mini-app
- User **TIDAK perlu memanggil `login()`** dari `usePrivy` hook untuk seamless login
- Untuk enable seamless login, gunakan `InlineKeyboardButton.web_app` atau `InlineKeyboardButton.login_url`
- Untuk link Telegram dalam Mini App, gunakan `linkTelegram({ launchParams })` dengan launchParams dari `@telegram-apps/bridge`

---

## 🔄 Changes Made

### **1. Updated `hooks/use-telegram-pair.ts`**

**Changes:**
- ✅ Menggunakan `user.telegram` (recommended by Privy) sebagai primary source
- ✅ Fallback ke `user.linkedAccounts` jika `user.telegram` tidak tersedia
- ✅ Menggunakan `telegram_user_id` field (sesuai Privy docs) dengan fallback ke `subject`
- ✅ Improved error handling dan logging

**Before:**
```typescript
const telegramAccount = user.linkedAccounts?.find(
  (account: any) => account.type === "telegram"
)
const telegramId = telegramAccount.subject
```

**After:**
```typescript
// Use Privy's recommended approach
let telegramAccount = user.telegram

// Fallback to linkedAccounts if user.telegram is not available
if (!telegramAccount) {
  telegramAccount = user.linkedAccounts?.find(
    (account: any) => account.type === "telegram"
  )
}

// Use telegram_user_id (Privy docs) with fallback to subject
const telegramId = telegramAccount.telegram_user_id || 
                   telegramAccount.subject || 
                   null
```

---

### **2. Created `hooks/use-telegram-seamless.ts`**

**Purpose:**
- Detect jika app berjalan di Telegram Mini App environment
- Handle seamless login scenario
- Provide helper untuk link Telegram dengan launchParams

**Usage:**
```tsx
import { useTelegramSeamless } from "@/hooks/use-telegram-seamless"

function MyComponent() {
  const { isSeamlessLogin, isLinking, error } = useTelegramSeamless()
  
  // Component logic
}
```

**Note:** Untuk full seamless linking, perlu install `@telegram-apps/bridge`:
```bash
npm install @telegram-apps/bridge
```

---

## 🔌 TelegramAccount Type (from Privy Docs)

Berdasarkan dokumentasi Privy, `TelegramAccount` memiliki fields:

| Field              | Type       | Description                                                      |
| ------------------ | ---------- | ---------------------------------------------------------------- |
| type               | 'telegram' | N/A                                                              |
| telegram_user_id   | string     | ID of a user's telegram account.                                 |
| first_name         | string     | The first name displayed on a user's telegram account.           |
| last_name         | (Optional) | The last name displayed on a user's telegram account.             |
| username           | (Optional) | The username displayed on a user's telegram account.             |
| photo_url          | (Optional) | The url of a user's telegram account profile picture.            |

**Access:**
- `user.telegram` - Direct access to Telegram account
- `user.linkedAccounts` - Array of all linked accounts (including Telegram)

---

## 🚀 Seamless Login Flow

### **1. From Telegram Bot**

**Bot sends message with login button:**
```typescript
bot.send_message(chat_id, 'Log in to FarBump!', {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: 'Login',
          login_url: { url: 'https://farbump.vercel.app' }
        },
        {
          text: 'Open App',
          web_app: { url: 'https://farbump.vercel.app' }
        }
      ]
    ]
  }
})
```

**Flow:**
1. User clicks button in Telegram bot
2. Telegram opens app in browser/webview
3. **Privy automatically logs user in** (no need to call `login()`)
4. `useTelegramPair` hook detects Telegram account
5. Auto-pairing occurs

---

### **2. From Telegram Mini App**

**Bot sends message with Mini App button:**
```typescript
bot.send_message(chat_id, 'Open FarBump!', {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: 'Open Mini App',
          web_app: { url: 'https://farbump.vercel.app' }
        }
      ]
    ]
  }
})
```

**Flow:**
1. User clicks button in Telegram bot
2. Telegram opens Mini App
3. **Privy automatically logs user in** (no need to call `login()`)
4. `useTelegramPair` hook detects Telegram account
5. Auto-pairing occurs

**For linking Telegram account (if not already linked):**
```tsx
import { retrieveLaunchParams } from '@telegram-apps/bridge'
import { usePrivy } from '@privy-io/react-auth'

function MyComponent() {
  const { linkTelegram } = usePrivy()
  
  const handleLinkTelegram = async () => {
    try {
      const launchParams = retrieveLaunchParams()
      await linkTelegram({ launchParams })
    } catch (error) {
      console.error('Failed to link Telegram:', error)
    }
  }
  
  // ...
}
```

**Note:** Telegram `launchParams` expire after 5 minutes for security.

---

## 🔧 Configuration

### **1. Privy Dashboard**

- ✅ Telegram enabled in Login Methods
- ✅ Bot Token configured
- ✅ Bot Handle configured
- ✅ Domain configured in BotFather

### **2. BotFather**

- ✅ Domain set: `farbump.vercel.app` (without https://)
- ✅ Bot created and active

### **3. CSP (Content Security Policy)**

Jika menggunakan CSP, perlu allow:
- `script-src`: `https://telegram.org` (untuk Telegram widget script)
- `frame-src`: `https://oauth.telegram.org` (untuk Telegram widget iframe)

**For Telegram Mini App:**
- Add `http://web.telegram.org` and `https://web.telegram.org` to allowed domains in Privy Dashboard

---

## 📝 Usage in Components

### **Basic Usage (Current Implementation)**

```tsx
import { useTelegramPair } from "@/hooks/use-telegram-pair"

function MyComponent() {
  const { isPaired, isPairing, error } = useTelegramPair()
  
  if (isPairing) {
    return <div>Pairing Telegram account...</div>
  }
  
  if (error) {
    return <div>Error: {error}</div>
  }
  
  if (isPaired) {
    return <div>✅ Telegram account paired!</div>
  }
  
  return <div>Waiting for Telegram login...</div>
}
```

### **Seamless Login Detection (Optional)**

```tsx
import { useTelegramSeamless } from "@/hooks/use-telegram-seamless"

function MyComponent() {
  const { isSeamlessLogin, isLinking, error } = useTelegramSeamless()
  
  if (isSeamlessLogin) {
    return <div>📱 Logged in via Telegram Mini App!</div>
  }
  
  // ...
}
```

---

## ✅ Testing

### **1. Standard Login (via Privy Modal)**

1. Open FarBump in browser
2. Click "Login via Telegram"
3. Enter phone number
4. Confirm in Telegram
5. ✅ User logged in
6. ✅ Telegram account paired

### **2. Seamless Login (from Telegram Bot)**

1. Open Telegram bot
2. Click login button (login_url or web_app)
3. Telegram opens app
4. ✅ User automatically logged in
5. ✅ Telegram account paired

### **3. Seamless Login (from Telegram Mini App)**

1. Open Telegram bot
2. Click Mini App button (web_app)
3. Telegram opens Mini App
4. ✅ User automatically logged in
5. ✅ Telegram account paired

---

## 🚨 Troubleshooting

### **Issue: Telegram account not detected**

**Solution:**
- Check if `user.telegram` exists
- Check if `user.linkedAccounts` contains Telegram account
- Verify Privy Dashboard configuration
- Check browser console for errors

### **Issue: Seamless login not working**

**Solution:**
- Verify app is opened from Telegram (not direct browser)
- Check if `window.Telegram.WebApp` exists
- Verify bot button uses `login_url` or `web_app`
- Check Privy Dashboard - Telegram enabled

### **Issue: launchParams expired**

**Solution:**
- launchParams expire after 5 minutes
- User must open app from Telegram within 5 minutes
- For linking, call `linkTelegram({ launchParams })` immediately after opening

---

## 📚 References

- [Privy Seamless Telegram Login](https://docs.privy.io/recipes/react/seamless-telegram)
- [Telegram Bot API - KeyboardButton](https://core.telegram.org/bots/api#keyboardbutton)
- [Telegram Bot API - InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)

---

## 🎯 Next Steps

1. **Test seamless login** dari Telegram bot
2. **Install @telegram-apps/bridge** untuk full seamless linking support
3. **Update ClawdBumpbot** untuk send login buttons
4. **Test Mini App** integration

