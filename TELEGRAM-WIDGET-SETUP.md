# Telegram Login Widget Setup - Alternative Solution

## 🎯 **Mengapa Menggunakan Telegram Login Widget Standar?**

Jika Privy Telegram OAuth stuck di tahap "Kami telah mengirimmu pesan", gunakan **Telegram Login Widget Standar** yang lebih reliable:

### **Keuntungan:**
- ✅ **Lebih stabil** - Sudah teruji dan digunakan banyak aplikasi
- ✅ **Mengirim pesan konfirmasi** - User menerima pesan di Telegram (tidak stuck)
- ✅ **Tidak bergantung pada Privy OAuth** - Bekerja secara independen
- ✅ **Bisa diintegrasikan dengan Privy** - Setelah login, pair dengan Privy user

---

## 📋 **Setup Step-by-Step**

### **1. Buat Bot Telegram di BotFather**

1. Buka Telegram dan cari **@BotFather**
2. Kirim command: `/newbot`
3. Ikuti instruksi:
   ```
   Bot name: FarBump Bot
   Username: farbump_bot (atau username yang tersedia)
   ```
4. Simpan **Bot Token** yang diberikan

### **2. Konfigurasi Domain di BotFather**

1. Kirim command: `/setdomain`
2. Pilih bot Anda: `@farbump_bot`
3. Masukkan domain: `your-domain.com` (tanpa https://)
   ```
   Example: farbump.vercel.app
   ```

### **3. Setup Environment Variables**

Tambahkan ke `.env.local` dan Vercel:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_BOT_USERNAME=farbump_bot
```

### **4. Update Backend untuk Validasi Hash**

Update endpoint `/api/v1/auth/telegram/init` untuk validasi hash menggunakan bot token.

---

## 🔧 **Implementasi di Frontend**

### **Option 1: Gunakan Komponen yang Sudah Dibuat**

```tsx
import { TelegramLoginWidget } from "@/components/telegram-login-widget"

function LoginPage() {
  const handleTelegramAuth = (user: TelegramUser) => {
    // User data sudah divalidasi oleh Telegram
    // Redirect ke pairing endpoint
    window.location.href = `/api/v1/auth/telegram/init?telegram_id=${user.id}&telegram_username=${user.username}`
  }

  return (
    <div>
      <h1>Login to FarBump</h1>
      
      {/* Telegram Login Widget */}
      <TelegramLoginWidget
        botUsername="farbump_bot"
        onAuth={handleTelegramAuth}
        size="large"
      />
      
      {/* Atau tetap gunakan Privy untuk method lain */}
      <PrivyLoginButton />
    </div>
  )
}
```

### **Option 2: Manual HTML Widget**

```html
<script async src="https://telegram.org/js/telegram-widget.js?22"
  data-telegram-login="farbump_bot"
  data-size="large"
  data-radius="20"
  data-onauth="onTelegramAuth(user)"
  data-request-access="write"></script>

<script type="text/javascript">
  function onTelegramAuth(user) {
    // Redirect ke pairing endpoint dengan user data
    const params = new URLSearchParams({
      telegram_id: user.id,
      telegram_username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      photo_url: user.photo_url || '',
      auth_date: user.auth_date,
      hash: user.hash, // Untuk validasi di backend
    })
    
    window.location.href = `/api/v1/auth/telegram/init?${params.toString()}`
  }
</script>
```

---

## 🔐 **Validasi Hash di Backend**

Update endpoint `/api/v1/auth/telegram/init` untuk validasi hash:

```typescript
import crypto from "crypto"

function validateTelegramHash(authData: Record<string, string>, botToken: string): boolean {
  const checkHash = authData.hash
  const dataCheckArr: string[] = []

  // Create data_check_arr (excluding hash)
  for (const [key, value] of Object.entries(authData)) {
    if (key !== "hash") {
      dataCheckArr.push(`${key}=${value}`)
    }
  }

  // Sort alphabetically
  dataCheckArr.sort()

  // Create data_check_string
  const dataCheckString = dataCheckArr.join("\n")

  // Create secret_key: SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest()

  // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex")

  // Compare hashes
  return calculatedHash === checkHash
}
```

---

## 🔄 **Flow Integrasi dengan Privy**

### **Hybrid Approach:**

1. **User login via Telegram Login Widget** (standar)
2. **Validasi hash di backend** menggunakan bot token
3. **Setelah validasi, redirect ke Privy login**
4. **Pair Telegram ID dengan Privy user**
5. **User sudah terautentikasi dengan Privy + Telegram**

### **Code Example:**

```typescript
// After Telegram login validated
async function handleTelegramLogin(telegramUser: TelegramUser) {
  // 1. Validate hash
  const isValid = validateTelegramHash(telegramUser, process.env.TELEGRAM_BOT_TOKEN!)
  if (!isValid) {
    throw new Error("Invalid Telegram hash")
  }

  // 2. Store Telegram data in session
  await fetch("/api/v1/auth/telegram/init", {
    method: "GET",
    // ... with telegram user data
  })

  // 3. Redirect to Privy login (optional)
  // Or directly pair with existing Privy session
  await fetch("/api/v1/auth/telegram/pair", {
    method: "POST",
    body: JSON.stringify({
      telegram_id: telegramUser.id.toString(),
      telegram_username: telegramUser.username,
      // ... other data
    }),
  })
}
```

---

## ✅ **Testing**

1. **Test di Local:**
   - Gunakan domain local dengan ngrok: `ngrok http 3000`
   - Set domain di BotFather: `your-ngrok-domain.ngrok.io`

2. **Test di Production:**
   - Pastikan domain sudah dikonfigurasi di BotFather
   - Test login flow
   - Verify pesan konfirmasi diterima di Telegram

---

## 🚨 **Troubleshooting**

### **Widget tidak muncul:**
- Pastikan bot username benar
- Pastikan domain sudah dikonfigurasi di BotFather
- Cek browser console untuk error

### **Hash validation gagal:**
- Pastikan bot token benar
- Pastikan semua data dikirim dengan benar
- Cek timezone (auth_date harus dalam 24 jam)

### **Pesan tidak diterima:**
- Pastikan user sudah start bot di Telegram
- Pastikan bot tidak diblokir
- Cek bot settings di BotFather

---

## 📚 **Referensi**

- [Telegram Login Widget Documentation](https://core.telegram.org/widgets/login)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Hash Validation Algorithm](https://core.telegram.org/widgets/login#checking-authorization)

