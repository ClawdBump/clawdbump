# 🚀 Quick Start: Deploy ke Vercel

Panduan cepat untuk deploy FarBump ke Vercel dan mendapatkan domain gratis.

## ⚡ Langkah Cepat (5 Menit)

### 1. Login ke Vercel
- Buka https://vercel.com
- Klik **Sign Up** atau **Login**
- Pilih **Continue with GitHub**

### 2. Import Project
1. Klik **Add New...** → **Project**
2. Pilih repository **FarBump/FarBumpBot**
3. Klik **Import**

### 3. Setup Environment Variables
**PENTING:** Setup ini sebelum klik Deploy!

Di halaman project setup, scroll ke **Environment Variables** dan tambahkan:

\`\`\`
NEXT_PUBLIC_PRIVY_APP_ID = [Privy App ID Anda]
NEXT_PUBLIC_SUPABASE_URL = [Supabase URL Anda]
NEXT_PUBLIC_SUPABASE_ANON_KEY = [Supabase Anon Key Anda]
\`\`\`

**Untuk setiap variable:**
- Klik **Add**
- Paste value
- Pilih **Production**, **Preview**, dan **Development**
- Klik **Save**

> 💡 **Tips:** `NEXT_PUBLIC_APP_URL` bisa diisi nanti setelah deploy (gunakan domain Vercel yang diberikan)

### 4. Deploy
1. Klik **Deploy**
2. Tunggu build selesai (2-5 menit)
3. **Selesai!** 🎉 Anda akan dapat domain: `https://farbumpbot.vercel.app`

## 📝 Setelah Deploy

### Update Manifest dengan Domain Vercel

1. Buka `public/.well-known/farcaster.json`
2. Ganti semua `https://farbump.vercel.app` dengan domain Vercel Anda (misalnya `https://farbumpbot.vercel.app`)
3. Commit dan push:
   \`\`\`bash
   git add public/.well-known/farcaster.json
   git commit -m "Update manifest with Vercel domain"
   git push
   \`\`\`
4. Vercel akan auto-deploy ulang

### Update Environment Variable `NEXT_PUBLIC_APP_URL`

1. Buka Vercel Dashboard → Project → **Settings** → **Environment Variables**
2. Edit `NEXT_PUBLIC_APP_URL` dengan domain Vercel Anda
3. Klik **Save**
4. **Redeploy** project

## ✅ Checklist

- [ ] Login ke Vercel dengan GitHub
- [ ] Import project FarBump/FarBumpBot
- [ ] Setup environment variables (minimal 3 required)
- [ ] Deploy berhasil
- [ ] Domain accessible di browser
- [ ] Update manifest dengan domain Vercel
- [ ] Update `NEXT_PUBLIC_APP_URL` di Vercel
- [ ] Test manifest: `https://[domain]/.well-known/farcaster.json`

## 🐛 Troubleshooting

### Build Failed?
- Pastikan semua environment variables sudah di-set
- Cek build logs di Vercel untuk detail error
- Pastikan `package.json` dependencies sudah benar

### Environment Variables Not Found?
- Pastikan menggunakan prefix `NEXT_PUBLIC_` untuk client-side
- Redeploy setelah menambah environment variables
- Cek di Vercel Dashboard → Settings → Environment Variables

### Domain Not Working?
- Tunggu 1-2 menit untuk DNS propagation
- Clear browser cache
- Cek deployment status di Vercel Dashboard

## 📚 Dokumentasi Lengkap

Lihat `VERCEL-DEPLOY.md` untuk panduan lengkap dan troubleshooting detail.

---

**Selamat!** 🎉 Aplikasi Anda sudah live di Vercel!
