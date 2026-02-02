# Railway Environment Variables

Berikut adalah daftar **SEMUA** environment variables yang WAJIB di-set di Railway Dashboard:

## 🔐 Database (Supabase)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://yusmynrsoplqadxukesv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c215bnJzb3BscWFkeHVrZXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5ODY5NTEsImV4cCI6MjA4MjU2Mjk1MX0.yA8iQKJkezNF_gDOER0XwVwkLqz8cvoSqDoo8UOiLno
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```

## 🔑 CDP (Coinbase Developer Platform)

**CRITICAL:** Gunakan nama variabel yang KONSISTEN di semua tempat!

```bash
CDP_API_KEY_NAME=<your_cdp_api_key_name>
CDP_API_KEY_PRIVATE_KEY=<your_cdp_private_key_pem_format>
```

**Format untuk CDP_API_KEY_PRIVATE_KEY:**
- Jika key Anda memiliki newlines, ganti dengan `\n` (backslash-n literal)
- Contoh: `-----BEGIN EC PRIVATE KEY-----\nMIHc....\n-----END EC PRIVATE KEY-----`
- Atau copy-paste seluruh PEM key (dengan newlines asli) jika Railway mendukung multiline

## 🌐 Base Network RPC

```bash
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

## 🔄 0x API

```bash
ZEROX_API_KEY=<your_0x_api_key>
```

## 📊 BaseScan API

```bash
BASESCAN_API_KEY=<your_basescan_api_key>
```

## 🏗️ Build & Runtime

```bash
NODE_ENV=production
PORT=8080
```

**IMPORTANT:** Railway will automatically set `PORT` environment variable. Script `start` di package.json sudah di-update untuk menggunakan `${PORT:-8080}` (defaultnya 8080 jika Railway tidak set).

## 📝 Optional (untuk debugging)

```bash
NODE_OPTIONS=--max-old-space-size=4096
```

---

## ✅ Checklist Verifikasi

Pastikan SEMUA variabel di atas sudah di-set di Railway Dashboard:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CDP_API_KEY_NAME`
- [ ] `CDP_API_KEY_PRIVATE_KEY` (format: PEM dengan `\n` untuk newlines)
- [ ] `NEXT_PUBLIC_BASE_RPC_URL`
- [ ] `ZEROX_API_KEY`
- [ ] `BASESCAN_API_KEY`
- [ ] `NODE_ENV` (set ke `production`)
- [ ] `PORT` (Railway akan set otomatis, atau bisa set manual ke `8080`)

---

## 🚨 Common Errors & Fixes

### Error: "file not found at ./cdp_api_key.json"
**Fix:** Pastikan `CDP_API_KEY_NAME` dan `CDP_API_KEY_PRIVATE_KEY` sudah di-set dengan benar.

### Error: "CDP_API_KEY_PRIVATE_KEY is not a valid PEM"
**Fix:** 
1. Pastikan format key adalah PEM (mulai dengan `-----BEGIN EC PRIVATE KEY-----`)
2. Ganti newlines dengan `\n` (literal backslash-n)
3. Atau copy-paste key dengan newlines asli jika Railway mendukung multiline input

### Error: "Paymaster allowlist error"
**Fix:** Ini bukan error environment variable. Ini issue dengan Coinbase Paymaster. Sudah di-fix dengan WETH distribution.

---

## 📚 Cara Set Environment Variables di Railway

1. Buka Railway Dashboard
2. Pilih project FarBump
3. Klik tab "Variables"
4. Klik "New Variable"
5. Input `Key` (nama variabel) dan `Value` (nilai variabel)
6. Klik "Add" untuk menyimpan
7. Deploy ulang aplikasi (Railway akan otomatis deploy setelah menambah/mengubah variabel)

---

## 🔍 Cara Verify Environment Variables

Setelah deploy, check logs di Railway untuk memastikan CDP Client ter-configure dengan benar:

```
✅ CDP Client configured from environment variables
   API Key Name: <your_api_key_name>
```

Jika muncul error:
```
❌ Failed to configure CDP Client: ...
```

Berarti ada masalah dengan format `CDP_API_KEY_PRIVATE_KEY`.

