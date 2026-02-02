# Telegram Login Stuck - Quick Fix

## 🎯 **Langkah Cepat untuk Fix**

### **1. Verifikasi Format (Paling Sering Salah)**

#### **Bot Handle di Privy Dashboard:**
```
✅ BENAR: @farbump_bot
❌ SALAH: farbump_bot (tanpa @)
```

#### **Domain di BotFather:**
```
✅ BENAR: farbump.vercel.app
❌ SALAH: https://farbump.vercel.app (dengan https://)
❌ SALAH: farbump.vercel.app/ (dengan /)
```

---

### **2. Test Bot Token**

Buka terminal dan jalankan:
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
```

**Ganti `<YOUR_BOT_TOKEN>` dengan token Anda.**

**Response yang benar:**
```json
{
  "ok": true,
  "result": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "FarBump Bot",
    "username": "farbump_bot"
  }
}
```

Jika error → bot token salah.

---

### **3. Cek Browser Console**

1. Buka Developer Tools (F12)
2. Tab **Console**
3. Coba login via Telegram
4. **Screenshot error** jika ada

**Error yang sering muncul:**
- `Refused to load script` → CSP issue
- `Telegram widget failed` → Bot config issue
- `Invalid bot token` → Token salah

---

### **4. Hard Refresh**

Setelah mengubah konfigurasi:
- **Windows:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

---

### **5. Verifikasi Privy Dashboard**

1. https://dashboard.privy.io/
2. Settings → Login Methods → Socials
3. Telegram section:
   - ✅ Toggle **ON**
   - ✅ Bot Token terisi
   - ✅ Bot Handle: `@farbump_bot` (dengan @)
4. **Save**
5. **Tunggu 1-2 menit** untuk sync

---

### **6. Test di Incognito Mode**

1. Buka browser incognito/private
2. Buka FarBump
3. Coba login via Telegram

Jika bekerja di incognito → masalah cache
Jika tidak bekerja → masalah konfigurasi

---

## 🔍 **Debug Info yang Diperlukan**

Jika masih stuck, kirimkan:

1. **Screenshot browser console** (F12 → Console tab)
2. **Screenshot Privy Dashboard** (Settings → Login Methods → Socials → Telegram)
3. **Screenshot BotFather** (`/setdomain` command)
4. **Response dari curl test** (step 2 di atas)
5. **Domain yang digunakan** (apakah `.xyz` atau TLD lain)

---

## ⚠️ **Penting: Domain .xyz**

Telegram **TIDAK support `.xyz` domains** untuk authentication.

Jika domain Anda `.xyz`, Anda perlu:
1. Gunakan domain lain (`.com`, `.app`, `.io`, dll)
2. Atau setup subdomain dengan TLD yang didukung

---

## 🚀 **Quick Test**

Coba test dengan command ini di terminal:

```bash
# Test 1: Bot token valid?
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe

# Test 2: Bot info
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe | jq
```

Jika kedua test berhasil → bot token valid, masalah di konfigurasi Privy atau domain.

