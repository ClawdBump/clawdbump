# Environment Variables Setup Guide

File ini menjelaskan cara setup environment variables untuk FarBump.

## 📋 Langkah-langkah Setup

### 1. Buat File `.env.local`

Buat file `.env.local` di root project (sama level dengan `package.json`).

**Windows:**
\`\`\`bash
copy env.example.txt .env.local
\`\`\`

**Mac/Linux:**
\`\`\`bash
cp env.example.txt .env.local
\`\`\`

### 2. Isi Environment Variables

Buka file `.env.local` dan isi dengan nilai yang sesuai:

#### 🔐 Privy Configuration (Required)

1. Login ke [Privy Dashboard](https://dashboard.privy.io)
2. Pilih aplikasi atau buat baru
3. Buka **Settings → General**
4. Salin **App ID**
5. Paste ke `NEXT_PUBLIC_PRIVY_APP_ID`

\`\`\`env
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxx
\`\`\`

**Setup Privy:**
- Aktifkan **Farcaster** login method
- Aktifkan **Smart Wallets** untuk Base Network (Chain ID: 8453)

#### 🗄️ Supabase Configuration (Required)

1. Login ke [Supabase Dashboard](https://supabase.com/dashboard)
2. Buat project baru atau pilih yang sudah ada
3. Buka **Settings → API**
4. Salin:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

#### 🌐 Application URL (Optional)

Untuk development lokal:
\`\`\`env
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

Untuk production:
\`\`\`env
NEXT_PUBLIC_APP_URL=https://farbump.vercel.app
\`\`\`

### 3. Verifikasi Setup

Setelah mengisi semua environment variables, restart development server:

\`\`\`bash
npm run dev
\`\`\`

Aplikasi akan membaca environment variables dari `.env.local`.

## 🔒 Security Notes

- ✅ File `.env.local` sudah di-ignore oleh Git (tidak akan ter-commit)
- ✅ Jangan pernah commit file `.env.local` ke repository
- ✅ Jangan share credentials Anda dengan siapa pun
- ✅ Untuk production, setup environment variables di hosting platform (Vercel, dll)

## 📝 Environment Variables List

### Required Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy App ID untuk authentication | [Privy Dashboard](https://dashboard.privy.io) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | [Supabase Dashboard](https://supabase.com/dashboard) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | [Supabase Dashboard](https://supabase.com/dashboard) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Application URL untuk webhooks | `http://localhost:3000` |
| `NEXT_PUBLIC_BASE_RPC_URL` | Custom Base RPC URL | Public RPC |
| `FARCASTER_WEBHOOK_SECRET` | Webhook secret untuk Farcaster | - |

## 🚀 Production Deployment

Untuk production (Vercel, Netlify, dll), setup environment variables di dashboard hosting:

1. Buka project settings
2. Pilih **Environment Variables**
3. Tambahkan semua variables dari `.env.local`
4. Deploy ulang aplikasi

## ❓ Troubleshooting

### Error: "NEXT_PUBLIC_PRIVY_APP_ID environment variable is required"

- Pastikan file `.env.local` ada di root project
- Pastikan variable sudah diisi dengan benar
- Restart development server setelah mengubah `.env.local`

### Error: Supabase connection failed

- Pastikan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` sudah benar
- Pastikan project Supabase sudah aktif
- Cek network connection

### Environment variables tidak terbaca

- Pastikan menggunakan prefix `NEXT_PUBLIC_` untuk client-side variables
- Restart development server
- Clear Next.js cache: `rm -rf .next` (Mac/Linux) atau `rmdir /s .next` (Windows)
