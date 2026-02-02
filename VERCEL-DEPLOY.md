# 🚀 Deploy FarBump ke Vercel

Panduan lengkap untuk deploy FarBump ke Vercel dan mendapatkan domain gratis.

## 📋 Prerequisites

1. ✅ Akun GitHub (sudah ada: FarBump/FarBumpBot)
2. ✅ Akun Vercel (buat di https://vercel.com)
3. ✅ Repository sudah di-push ke GitHub

## 🎯 Langkah-langkah Deploy

### 1. Login ke Vercel

1. Buka https://vercel.com
2. Klik **Sign Up** atau **Login**
3. Pilih **Continue with GitHub** untuk koneksi otomatis dengan repository

### 2. Import Project

1. Setelah login, klik **Add New...** → **Project**
2. Pilih repository **FarBump/FarBumpBot** dari daftar
3. Klik **Import**

### 3. Configure Project

Vercel akan auto-detect Next.js. Pastikan konfigurasi:

**Framework Preset:** Next.js (auto-detected)

**Root Directory:** `./` (default)

**Build Command:** `npm run build` (default)

**Output Directory:** `.next` (default)

**Install Command:** `npm install` (default)

### 4. Setup Environment Variables

**PENTING:** Setup environment variables sebelum deploy pertama!

1. Di halaman project setup, scroll ke **Environment Variables**
2. Klik **Add** untuk setiap variable:

#### Required Variables:

\`\`\`
NEXT_PUBLIC_PRIVY_APP_ID
Value: [Masukkan Privy App ID Anda]

NEXT_PUBLIC_SUPABASE_URL
Value: [Masukkan Supabase URL Anda]

NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: [Masukkan Supabase Anon Key Anda]

NEXT_PUBLIC_APP_URL
Value: https://[project-name].vercel.app
(akan otomatis terisi setelah deploy, bisa update nanti)
\`\`\`

3. Pilih **Environment:** Production, Preview, dan Development
4. Klik **Save**

### 5. Deploy

1. Klik **Deploy**
2. Tunggu proses build (sekitar 2-5 menit)
3. Setelah selesai, Anda akan mendapatkan domain:
   - **Production:** `https://farbumpbot.vercel.app` (atau sesuai project name)
   - **Preview:** `https://farbumpbot-[branch]-[hash].vercel.app`

### 6. Update Domain di Manifest

Setelah deploy, update manifest dengan domain Vercel:

1. Buka `public/.well-known/farcaster.json`
2. Ganti semua `https://farbump.vercel.app` dengan domain Vercel Anda
3. Commit dan push:
   \`\`\`bash
   git add public/.well-known/farcaster.json
   git commit -m "Update manifest with Vercel domain"
   git push
   \`\`\`
4. Vercel akan auto-deploy ulang

## 🔧 Setup Domain Custom (Optional)

Jika ingin menggunakan domain custom (misalnya `farbump.com`):

1. Di Vercel Dashboard → Project → **Settings** → **Domains**
2. Klik **Add Domain**
3. Masukkan domain Anda
4. Ikuti instruksi untuk setup DNS

## 📝 Environment Variables di Vercel

### Cara Update Environment Variables:

1. Buka project di Vercel Dashboard
2. **Settings** → **Environment Variables**
3. Edit atau tambah variable baru
4. Klik **Save**
5. **Redeploy** project untuk apply changes

### Environment Variables yang Perlu Di-set:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy App ID | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | ✅ Yes |
| `NEXT_PUBLIC_APP_URL` | Your Vercel domain | ✅ Yes |
| `NEXT_PUBLIC_BASE_RPC_URL` | Custom Base RPC (optional) | ❌ No |

## 🔄 Auto-Deploy dari GitHub

Setelah setup pertama, setiap push ke GitHub akan trigger auto-deploy:

- **Push ke `main` branch** → Deploy ke Production
- **Push ke branch lain** → Deploy ke Preview

## 🧪 Testing Deployment

Setelah deploy, test:

1. **Buka domain Vercel** di browser
2. **Cek manifest:** `https://[domain]/.well-known/farcaster.json`
3. **Test di Warpcast:** Buka Mini App di Warpcast mobile app

## 🐛 Troubleshooting

### Build Failed

**Error:** Build command failed
- Pastikan semua dependencies terinstall
- Cek `package.json` scripts
- Lihat build logs di Vercel untuk detail error

### Environment Variables Not Found

**Error:** `NEXT_PUBLIC_PRIVY_APP_ID environment variable is required`
- Pastikan environment variables sudah di-set di Vercel
- Pastikan menggunakan prefix `NEXT_PUBLIC_` untuk client-side
- Redeploy setelah menambah environment variables

### Manifest Not Accessible

**Error:** 404 untuk `/.well-known/farcaster.json`
- Pastikan file ada di `public/.well-known/farcaster.json`
- Pastikan sudah di-commit dan push
- Cek file structure di Vercel deployment

### Domain Not Working

- Tunggu beberapa menit untuk DNS propagation
- Clear browser cache
- Cek Vercel deployment status

## 📚 Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
- [Environment Variables](https://vercel.com/docs/environment-variables)

## ✅ Checklist Setelah Deploy

- [ ] Build berhasil di Vercel
- [ ] Domain accessible di browser
- [ ] Manifest accessible di `/.well-known/farcaster.json`
- [ ] Environment variables sudah di-set
- [ ] Update manifest dengan domain Vercel
- [ ] Test di Warpcast mobile app
- [ ] Privy authentication bekerja
- [ ] Supabase connection berhasil

---

**Selamat!** 🎉 Aplikasi Anda sudah live di Vercel dengan domain gratis!
