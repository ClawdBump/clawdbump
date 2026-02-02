# Environment Variables Setup

## Quick Setup

1. **Copy environment file:**
   \`\`\`bash
   # Windows
   copy env.example.txt .env.local
   
   # Mac/Linux
   cp env.example.txt .env.local
   \`\`\`

2. **File `.env.local` sudah berisi credentials Supabase yang sudah dikonfigurasi:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. **Tambahkan Privy App ID** (jika belum ada):
   \`\`\`env
   NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id-here
   \`\`\`

4. **Restart development server:**
   \`\`\`bash
   npm run dev
   \`\`\`

## Environment Variables

### Supabase (Already Configured)
\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://yusmynrsoplqadxukesv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c215bnJzb3BscWFkeHVrZXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5ODY5NTEsImV4cCI6MjA4MjU2Mjk1MX0.yA8iQKJkezNF_gDOER0XwVwkLqz8cvoSqDoo8UOiLno
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c215bnJzb3BscWFkeHVrZXN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk4Njk1MSwiZXhwIjoyMDgyNTYyOTUxfQ.M4IanYhq79_Z_n-6iIdGV2_83yMiD9Ndqy2TEw4dM-s
\`\`\`

### Privy (Required)
\`\`\`env
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id-here
\`\`\`

### 0x Swap API (Required for token swaps)
\`\`\`env
# IMPORTANT: Use ZEROX_API_KEY (not NEXT_PUBLIC_ZEROX_API_KEY) for security
# API key is server-side only and never exposed to client
ZEROX_API_KEY=bec0c136-9487-4a50-9ceb-995e8d6a1419
\`\`\`

### CoinGecko API (Optional but recommended for ETH price)
\`\`\`env
# IMPORTANT: Server-side only - never expose to client
# Without API key: Free tier (30 calls/minute)
# With API key: Higher rate limits (varies by plan)
# Get your API key from: https://www.coingecko.com/en/api
COINGECKO_API_KEY=CG-8ZfuGSPd2sQzpuVVKk6aL7rK
\`\`\`

## Database Setup

1. **Buka Supabase Dashboard**: https://supabase.com/dashboard
2. **Pilih project**: `yusmynrsoplqadxukesv`
3. **Buka SQL Editor**
4. **Copy dan paste seluruh isi file `DATABASE-SCHEMA.sql`**
5. **Jalankan query**

## Verification

Setelah setup, verifikasi:
- ✅ Database tables created (`user_credits`, `conversion_logs`)
- ✅ Function `increment_user_credit` created
- ✅ Environment variables loaded
- ✅ Supabase connection working
