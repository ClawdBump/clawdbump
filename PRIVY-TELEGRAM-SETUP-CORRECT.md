# Privy Telegram Login - Setup Guide (Correct Implementation)

Berdasarkan dokumentasi resmi Privy: https://docs.privy.io/authentication/user-authentication/login-methods/telegram

## 🔍 **Cara Kerja Privy Telegram Login**

Privy menggunakan **Telegram Login Widget** (bukan OAuth popup). Widget ini akan muncul di Privy login modal secara otomatis setelah dikonfigurasi dengan benar.

---

## ✅ **Setup Step-by-Step**

### **1. Buat Bot Telegram di BotFather**

1. Buka Telegram dan cari **@BotFather**
2. Kirim command: `/newbot`
3. Ikuti instruksi:
   ```
   Bot name: FarBump Bot
   Username: farbump_bot (atau username yang tersedia)
   ```
4. **Simpan Bot Token** yang diberikan (format: `1234567890:AzByCxDwEvFuGtHsIr1k2M4o5Q6s7U8w9Y0`)

### **2. Konfigurasi Domain di BotFather**

1. Kirim command: `/setdomain`
2. Pilih bot Anda: `@farbump_bot`
3. Masukkan domain: `your-domain.com` (tanpa https://)
   ```
   Example: farbump.vercel.app
   ```

**⚠️ PENTING:**
- Telegram **TIDAK support `.xyz` domains** untuk authentication
- Jika domain Anda `.xyz`, gunakan domain lain atau subdomain dengan TLD yang didukung

### **3. Konfigurasi di Privy Dashboard**

1. Login ke [Privy Dashboard](https://dashboard.privy.io/)
2. Pilih aplikasi FarBump Anda
3. Buka **Settings** → **Login Methods** → **Socials** tab
4. Aktifkan **Telegram**
5. **Masukkan:**
   - **Bot Token**: Token dari BotFather (format: `1234567890:AzByCxDwEvFuGtHsIr1k2M4o5Q6s7U8w9Y0`)
   - **Bot Handle**: Username bot dengan @ (format: `@farbump_bot`)
6. **Save**

### **4. Konfigurasi CSP (Content Security Policy)**

Jika Anda menggunakan CSP, tambahkan directives berikut:

```html
<!-- script-src: Allow Telegram widget script -->
script-src 'self' https://telegram.org;

<!-- frame-src: Allow Telegram OAuth iframe -->
frame-src 'self' https://oauth.telegram.org;
```

### **5. Konfigurasi Domain untuk Telegram Mini App (Optional)**

Jika ingin menggunakan app sebagai Telegram Mini App:

1. Privy Dashboard → **Configuration** → **App settings** → **Domains**
2. Tambahkan:
   - `http://web.telegram.org`
   - `https://web.telegram.org`

---

## 💻 **Implementasi di Code**

### **Option 1: Menggunakan Privy Login Modal (Recommended)**

Privy akan **otomatis** menampilkan Telegram login di modal jika sudah dikonfigurasi:

```tsx
import { usePrivy } from "@privy-io/react-auth"

function LoginButton() {
  const { login } = usePrivy()
  
  return <button onClick={login}>Login</button>
}
```

Telegram akan muncul sebagai opsi di Privy login modal.

### **Option 2: Menggunakan Hook Khusus Telegram**

Untuk kontrol lebih, gunakan `useLoginWithTelegram`:

```tsx
import { useLoginWithTelegram } from "@privy-io/react-auth"

function TelegramLoginButton() {
  const { login, state } = useLoginWithTelegram({
    onComplete: (params) => {
      console.log("Login successful:", params.user)
      // Auto-pairing akan terjadi di useTelegramPair hook
    },
    onError: (error) => {
      console.error("Login failed:", error)
    },
  })

  return (
    <button 
      onClick={login}
      disabled={state.status === "loading"}
    >
      {state.status === "loading" ? "Loading..." : "Login with Telegram"}
    </button>
  )
}
```

---

## 🔄 **Flow yang Benar**

1. **User klik "Login with Telegram"**
   - Privy membuka modal dengan Telegram Login Widget
   - Widget menggunakan bot yang sudah dikonfigurasi

2. **User klik widget di modal**
   - Telegram Login Widget akan meminta authorization
   - User akan melihat pesan "Kami telah mengirimmu pesan" (ini normal)

3. **User menerima pesan di Telegram**
   - Bot mengirim pesan konfirmasi ke Telegram user
   - User klik "Confirm" di pesan

4. **Login berhasil**
   - Privy menutup modal
   - User sudah terautentikasi
   - `useTelegramPair` hook otomatis memanggil pairing endpoint

---

## 🚨 **Troubleshooting: Stuck di "Kami telah mengirimmu pesan"**

### **Penyebab:**
1. **Bot token belum dikonfigurasi di Privy Dashboard**
2. **Domain belum dikonfigurasi di BotFather**
3. **Bot belum di-start oleh user di Telegram**
4. **Domain menggunakan `.xyz` TLD** (tidak didukung)

### **Solusi:**

1. **Cek Privy Dashboard:**
   - Settings → Login Methods → Socials → Telegram
   - Pastikan Bot Token dan Bot Handle sudah diisi
   - Pastikan Telegram aktif

2. **Cek BotFather:**
   - Kirim `/setdomain` ke @BotFather
   - Pastikan domain sudah dikonfigurasi

3. **Cek Bot di Telegram:**
   - User harus start bot terlebih dahulu
   - Kirim `/start` ke bot Anda

4. **Cek Domain:**
   - Pastikan domain bukan `.xyz`
   - Gunakan domain dengan TLD yang didukung (`.com`, `.app`, `.io`, dll)

5. **Cek Browser Console:**
   - Buka Developer Tools (F12)
   - Cek tab Console untuk error
   - Cek tab Network untuk failed requests

---

## 📝 **Environment Variables**

Tidak ada environment variable yang diperlukan untuk Privy Telegram login. Semua konfigurasi dilakukan di Privy Dashboard.

**Tapi jika menggunakan Telegram Login Widget standar (bukan Privy), tambahkan:**
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=farbump_bot
```

---

## 🔐 **Security Notes**

⚠️ **PENTING:** Bot token adalah symmetric key yang digunakan untuk authentication. Kompromi token ini akan membahayakan semua user yang login via Telegram.

**Best Practices:**
- Jangan commit bot token ke git
- Simpan bot token di Privy Dashboard (server-side)
- Jangan expose bot token di client-side code
- Rotate bot token secara berkala

---

## 📚 **Referensi**

- [Privy Telegram Documentation](https://docs.privy.io/authentication/user-authentication/login-methods/telegram)
- [Privy Seamless Telegram Login](https://docs.privy.io/recipes/react/seamless-telegram)
- [Telegram Login Widget](https://core.telegram.org/widgets/login)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## ✅ **Checklist Setup**

- [ ] Bot Telegram dibuat di BotFather
- [ ] Bot token disimpan dengan aman
- [ ] Domain dikonfigurasi di BotFather (`/setdomain`)
- [ ] Privy Dashboard - Telegram login method aktif
- [ ] Privy Dashboard - Bot token diisi
- [ ] Privy Dashboard - Bot handle diisi
- [ ] CSP directives dikonfigurasi (jika menggunakan CSP)
- [ ] Domain bukan `.xyz` TLD
- [ ] Test login flow
- [ ] Verify pesan konfirmasi diterima di Telegram

