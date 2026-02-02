# 🔧 Privy Dashboard Setup Guide

Panduan lengkap untuk setup Privy Dashboard untuk aplikasi FarBump.

## 📋 Daftar Checklist

Sebelum memulai, pastikan Anda sudah:
- ✅ Memiliki akun Privy (daftar di https://dashboard.privy.io)
- ✅ Sudah membuat aplikasi baru di Privy Dashboard
- ✅ Memiliki akses ke Base Network (Chain ID: 8453)

---

## 🚀 Langkah-langkah Setup

### 1. Login ke Privy Dashboard

1. Buka https://dashboard.privy.io
2. Login dengan akun Privy Anda
3. Pilih aplikasi yang sudah dibuat, atau buat aplikasi baru

---

### 2. Setup Authentication - Enable Farcaster Login

**Lokasi:** Settings → Authentication → Login Methods

1. Buka menu **Settings** di sidebar kiri
2. Pilih **Authentication**
3. Klik tab **Login Methods**
4. Cari **Farcaster** di daftar login methods
5. **Enable** Farcaster dengan toggle switch
6. Klik **Save** untuk menyimpan perubahan

**Catatan:**
- Farcaster login method diperlukan karena aplikasi ini adalah Farcaster Mini App
- User akan login menggunakan akun Farcaster mereka

---

### 3. Setup Wallets - Enable Smart Wallets untuk Base Network

**Lokasi:** Settings → Wallets → Smart Wallets

1. Buka menu **Settings** di sidebar kiri
2. Pilih **Wallets**
3. Klik tab **Smart Wallets**
4. Pastikan **Smart Wallets** sudah diaktifkan (toggle ON)
5. Di bagian **Supported Chains**, cari atau tambahkan **Base Network**:
   - **Chain Name:** Base
   - **Chain ID:** 8453
   - **Network:** Mainnet
6. Pastikan Base Network sudah **enabled** (toggle ON)
7. Klik **Save** untuk menyimpan perubahan

**Catatan:**
- Smart Wallets adalah wallet yang dibuat untuk setiap user dan digunakan untuk transaksi
- Base Network (Chain ID: 8453) adalah network yang digunakan aplikasi ini
- Smart Wallets akan otomatis dibuat saat user login

---

### 4. Setup Wallets - Configure Embedded Wallets (Optional)

**Lokasi:** Settings → Wallets → Embedded Wallets

1. Buka menu **Settings** di sidebar kiri
2. Pilih **Wallets**
3. Klik tab **Embedded Wallets**
4. Pastikan **Embedded Wallets** sudah diaktifkan (toggle ON)
5. Di bagian **Ethereum**, pastikan:
   - **Create on Login:** `All Users` atau `Users Without Wallets`
   - **Supported Chains:** Pastikan Base Network (8453) sudah ditambahkan
6. Klik **Save** untuk menyimpan perubahan

**Catatan:**
- Embedded Wallets adalah wallet yang dibuat untuk kompatibilitas
- User Farcaster sudah punya embed wallet dari Farcaster, tapi kita tetap create untuk kompatibilitas
- Embedded Wallets tidak digunakan untuk transaksi, hanya Smart Wallets yang digunakan

---

### 5. Get App ID

**Lokasi:** Settings → General

1. Buka menu **Settings** di sidebar kiri
2. Pilih **General**
3. Di bagian **App Information**, cari **App ID**
4. **Copy** App ID (format: `clxxxxxxxxxxxxx`)
5. Paste ke file `.env.local` di project:
   \`\`\`env
   NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxx
   \`\`\`

**Catatan:**
- App ID adalah identifier unik untuk aplikasi Anda
- Jangan share App ID ke publik
- App ID diperlukan untuk koneksi antara aplikasi dan Privy

---

### 6. Configure Allowed Origins (Optional, untuk Production)

**Lokasi:** Settings → Security → Allowed Origins

Jika aplikasi sudah di-deploy ke production, tambahkan domain production ke Allowed Origins:

1. Buka menu **Settings** di sidebar kiri
2. Pilih **Security**
3. Klik tab **Allowed Origins**
4. Tambahkan domain production Anda:
   - Contoh: `https://farbump.vercel.app`
   - Untuk development lokal: `http://localhost:3000` (sudah default)
5. Klik **Save** untuk menyimpan perubahan

**Catatan:**
- Allowed Origins mencegah aplikasi lain menggunakan App ID Anda
- Tambahkan semua domain yang akan digunakan (development, staging, production)

---

## ✅ Checklist Verifikasi

Setelah setup, pastikan semua konfigurasi sudah benar:

- [ ] **Farcaster Login Method** sudah diaktifkan
- [ ] **Smart Wallets** sudah diaktifkan
- [ ] **Base Network (Chain ID: 8453)** sudah ditambahkan ke Smart Wallets
- [ ] **Embedded Wallets** sudah dikonfigurasi (optional)
- [ ] **App ID** sudah di-copy dan ditambahkan ke `.env.local`
- [ ] **Allowed Origins** sudah dikonfigurasi untuk production (optional)

---

## 🔍 Verifikasi Setup

Setelah setup selesai, test aplikasi:

1. **Start development server:**
   \`\`\`bash
   npm run dev
   \`\`\`

2. **Buka aplikasi di browser:**
   - Development: http://localhost:3000
   - Production: https://farbump.vercel.app

3. **Test di Warpcast:**
   - Buka Warpcast mobile app
   - Buka Mini App FarBump
   - Klik tombol **CONNECT**
   - Pastikan login dengan Farcaster berhasil
   - Pastikan Smart Wallet address muncul di Wallet Card

4. **Check Console Logs:**
   - Buka browser console (F12)
   - Pastikan tidak ada error terkait Privy
   - Pastikan Smart Wallet address terdeteksi

---

## 🐛 Troubleshooting

### Error: "Farcaster login method not enabled"

**Solusi:**
- Pastikan Farcaster sudah diaktifkan di Settings → Authentication → Login Methods
- Restart development server setelah perubahan

### Error: "Smart Wallets not enabled for Base Network"

**Solusi:**
- Pastikan Smart Wallets sudah diaktifkan di Settings → Wallets → Smart Wallets
- Pastikan Base Network (Chain ID: 8453) sudah ditambahkan dan diaktifkan
- Restart development server setelah perubahan

### Error: "Invalid App ID"

**Solusi:**
- Pastikan App ID sudah di-copy dengan benar dari Privy Dashboard
- Pastikan App ID sudah ditambahkan ke `.env.local`
- Pastikan format App ID benar (dimulai dengan `cl`)
- Restart development server setelah perubahan

### Error: "Frame ancestor is not allowed"

**Solusi:**
- Tambahkan domain production ke Allowed Origins di Settings → Security
- Pastikan domain sudah benar (dengan `https://` untuk production)
- Restart development server setelah perubahan

### Smart Wallet tidak muncul setelah login

**Solusi:**
- Pastikan Smart Wallets sudah diaktifkan di Privy Dashboard
- Pastikan Base Network sudah ditambahkan ke Smart Wallets
- Check console logs untuk error terkait wallet creation
- Pastikan user sudah login dengan Farcaster

---

## 📚 Referensi

- **Privy Dashboard:** https://dashboard.privy.io
- **Privy Documentation:** https://docs.privy.io
- **Base Network:** https://base.org
- **Farcaster Mini Apps:** https://miniapps.farcaster.xyz

---

## 💡 Tips

1. **Development vs Production:**
   - Gunakan App ID yang sama untuk development dan production
   - Atau buat aplikasi terpisah untuk development dan production

2. **Smart Wallets:**
   - Smart Wallets akan otomatis dibuat saat user pertama kali login
   - Smart Wallet address akan tetap sama untuk user yang sama
   - Smart Wallets digunakan untuk semua transaksi di aplikasi

3. **Embedded Wallets:**
   - Embedded Wallets dibuat untuk kompatibilitas
   - Tidak digunakan untuk transaksi, hanya Smart Wallets yang digunakan
   - User Farcaster sudah punya embed wallet dari Farcaster

4. **Base Network:**
   - Pastikan Base Network (Chain ID: 8453) sudah ditambahkan ke semua wallet configurations
   - Base Network adalah network yang digunakan aplikasi ini

---

## 🎯 Summary

Setup Privy Dashboard untuk FarBump membutuhkan:

1. ✅ **Enable Farcaster Login Method**
2. ✅ **Enable Smart Wallets untuk Base Network (Chain ID: 8453)**
3. ✅ **Configure Embedded Wallets (optional)**
4. ✅ **Copy App ID ke `.env.local`**
5. ✅ **Configure Allowed Origins untuk production (optional)**

Setelah semua setup selesai, aplikasi siap digunakan!









