# Telegram Login Stuck - Debug Guide

## ✅ **Setup yang Sudah Dilakukan:**
- [x] Bot Telegram dibuat
- [x] Bot token di env variable
- [x] Bot token di Privy Dashboard
- [x] Bot handle di Privy Dashboard
- [x] Domain dikonfigurasi
- [x] Bot sudah di-start di Telegram

---

## 🔍 **Debugging Steps**

### **1. Verifikasi Format Bot Handle**

**Format yang BENAR:**
```
@farbump_bot
```

**Format yang SALAH:**
```
farbump_bot  ❌ (tanpa @)
@farbump_bot_bot  ❌ (jika username sebenarnya tidak ada _bot)
```

**Cek:**
1. Privy Dashboard → Settings → Login Methods → Socials → Telegram
2. Pastikan Bot Handle dimulai dengan `@`
3. Pastikan username sesuai dengan yang di BotFather

---

### **2. Verifikasi Format Domain**

**Format yang BENAR:**
```
farbump.vercel.app
```

**Format yang SALAH:**
```
https://farbump.vercel.app  ❌ (dengan https://)
farbump.vercel.app/  ❌ (dengan trailing slash)
```

**Cek di BotFather:**
1. Kirim `/setdomain` ke @BotFather
2. Pilih bot Anda
3. Pastikan domain tanpa `https://` dan tanpa `/`

---

### **3. Cek Browser Console untuk Error**

1. Buka Developer Tools (F12)
2. Buka tab **Console**
3. Coba login via Telegram
4. Cari error yang terkait dengan:
   - `telegram`
   - `widget`
   - `oauth`
   - `CSP` (Content Security Policy)
   - `script-src`
   - `frame-src`

**Common Errors:**
- `Refused to load the script 'https://telegram.org/js/telegram-widget.js'` → CSP issue
- `Refused to frame 'https://oauth.telegram.org'` → CSP issue
- `Telegram widget failed to load` → Bot token/handle issue

---

### **4. Cek Network Tab**

1. Buka Developer Tools (F12)
2. Buka tab **Network**
3. Filter: `telegram` atau `oauth`
4. Coba login via Telegram
5. Cek apakah ada request yang gagal (status merah)
6. Klik request yang gagal untuk melihat detail error

---

### **5. Verifikasi Privy Dashboard Configuration**

**Step-by-Step:**

1. Login ke https://dashboard.privy.io/
2. Pilih aplikasi FarBump
3. Settings → Login Methods → Socials tab
4. Cek Telegram section:
   - ✅ Status: **Enabled** (toggle harus ON)
   - ✅ Bot Token: Harus terisi (format: `1234567890:AzByCx...`)
   - ✅ Bot Handle: Harus terisi (format: `@farbump_bot`)
5. **Save** (jika ada perubahan)
6. **Refresh halaman** untuk memastikan perubahan tersimpan

---

### **6. Hard Refresh Browser**

Setelah mengubah konfigurasi di Privy Dashboard:

1. **Hard Refresh:**
   - Windows/Linux: `Ctrl + Shift + R` atau `Ctrl + F5`
   - Mac: `Cmd + Shift + R`
2. Atau **Clear Cache:**
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
3. **Coba login lagi**

---

### **7. Test dengan Browser Lain**

1. Coba di browser lain:
   - Chrome
   - Firefox
   - Safari
   - Edge
2. Jika bekerja di browser lain → masalah di browser pertama (cache/extension)
3. Jika tidak bekerja di semua browser → masalah konfigurasi

---

### **8. Cek CSP (Content Security Policy)**

Jika menggunakan CSP, pastikan directives berikut ada:

**Di `next.config.mjs` atau middleware:**
```javascript
headers: [
  {
    key: 'Content-Security-Policy',
    value: [
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org",
      "frame-src 'self' https://oauth.telegram.org",
      // ... other directives
    ].join('; ')
  }
]
```

**Atau di HTML head:**
```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' https://telegram.org; frame-src 'self' https://oauth.telegram.org">
```

---

### **9. Verifikasi Bot Token**

**Test bot token:**
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
```

**Response yang benar:**
```json
{
  "ok": true,
  "result": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "FarBump Bot",
    "username": "farbump_bot",
    ...
  }
}
```

Jika error → bot token salah atau bot tidak valid.

---

### **10. Cek Privy App ID**

Pastikan `NEXT_PUBLIC_PRIVY_APP_ID` di environment variable sesuai dengan Privy Dashboard.

**Cek:**
1. Privy Dashboard → Settings → App settings
2. Copy App ID
3. Bandingkan dengan `.env.local` atau Vercel environment variables

---

### **11. Test dengan Privy Login Modal**

Coba login menggunakan Privy login modal (bukan custom button):

```tsx
import { usePrivy } from "@privy-io/react-auth"

function TestLogin() {
  const { login } = usePrivy()
  
  return <button onClick={login}>Open Privy Login</button>
}
```

Jika Telegram muncul di modal → konfigurasi benar
Jika Telegram tidak muncul → konfigurasi belum benar

---

### **12. Cek Telegram Widget Script Loading**

Di browser console, cek apakah script Telegram widget ter-load:

```javascript
// Di console, ketik:
document.querySelector('script[src*="telegram.org/js/telegram-widget"]')
```

Jika `null` → script tidak ter-load (CSP issue atau Privy belum load widget)
Jika ada element → script ter-load (masalah lain)

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: Widget tidak muncul di Privy modal**

**Penyebab:**
- Bot token/handle belum dikonfigurasi di Privy Dashboard
- Telegram login method tidak aktif

**Solusi:**
1. Privy Dashboard → Settings → Login Methods → Socials
2. Pastikan Telegram **Enabled**
3. Pastikan Bot Token dan Bot Handle terisi
4. Save dan refresh

---

### **Issue 2: "Refused to load script" error**

**Penyebab:**
- CSP blocking Telegram widget script

**Solusi:**
1. Tambahkan `https://telegram.org` ke `script-src`
2. Tambahkan `https://oauth.telegram.org` ke `frame-src`
3. Restart dev server / redeploy

---

### **Issue 3: Stuck di "Kami telah mengirimmu pesan"**

**Penyebab:**
- Bot belum di-start oleh user
- Domain tidak dikonfigurasi dengan benar
- Bot token/handle salah

**Solusi:**
1. Pastikan user sudah `/start` bot di Telegram
2. Verifikasi domain di BotFather (`/setdomain`)
3. Verifikasi bot token dan handle di Privy Dashboard
4. Cek browser console untuk error

---

### **Issue 4: "Invalid bot token" error**

**Penyebab:**
- Bot token salah atau expired
- Format bot token salah

**Solusi:**
1. Dapatkan bot token baru dari BotFather (`/token`)
2. Update di Privy Dashboard
3. Pastikan format: `1234567890:AzByCxDwEvFuGtHsIr1k2M4o5Q6s7U8w9Y0`

---

## 📋 **Quick Checklist**

- [ ] Bot handle format: `@farbump_bot` (dengan @)
- [ ] Domain format: `farbump.vercel.app` (tanpa https:// dan /)
- [ ] Bot token valid (test dengan curl)
- [ ] Privy Dashboard - Telegram enabled
- [ ] Privy Dashboard - Bot token terisi
- [ ] Privy Dashboard - Bot handle terisi
- [ ] User sudah `/start` bot di Telegram
- [ ] Browser console - tidak ada error
- [ ] Network tab - tidak ada failed requests
- [ ] CSP directives dikonfigurasi (jika menggunakan CSP)
- [ ] Hard refresh browser setelah konfigurasi
- [ ] Test di browser lain

---

## 🔧 **Next Steps**

Jika masih stuck setelah semua langkah di atas:

1. **Screenshot error di browser console**
2. **Screenshot Privy Dashboard configuration**
3. **Screenshot BotFather domain configuration**
4. **Test bot token dengan curl**
5. **Cek network requests yang gagal**

Dengan informasi ini, kita bisa debug lebih lanjut.

