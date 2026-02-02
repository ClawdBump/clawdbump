# Database Schema - FarBump Credit System

Dokumentasi schema database untuk sistem "Convert $BUMP to Credit" menggunakan Supabase/PostgreSQL.

## 🚀 Quick Start

**Untuk setup cepat, gunakan file `DATABASE-SCHEMA.sql` yang berisi pure SQL code siap pakai.**

1. Buka Supabase Dashboard → SQL Editor
2. Copy seluruh isi file `DATABASE-SCHEMA.sql`
3. Paste dan jalankan di SQL Editor
4. Selesai! ✅

## 📋 Tabel yang Dibuat

### 1. `user_credits`
Menyimpan saldo credit (ETH) setiap user dalam satuan Wei.

**Kolom:**
- `user_address` (TEXT, PK): Alamat wallet user (lowercase)
- `balance_wei` (NUMERIC): Saldo credit dalam satuan Wei (BigInt)
- `last_updated` (TIMESTAMPTZ): Timestamp terakhir update
- `created_at` (TIMESTAMPTZ): Timestamp pembuatan record

### 2. `conversion_logs`
Menyimpan audit log untuk setiap konversi $BUMP ke Credit.

**Kolom:**
- `id` (BIGSERIAL, PK): Auto-increment ID
- `user_address` (TEXT): Alamat wallet user
- `tx_hash` (TEXT, UNIQUE): Hash transaksi blockchain
- `amount_bump` (TEXT): Jumlah $BUMP yang dikonversi (human-readable)
- `amount_bump_wei` (TEXT): Jumlah $BUMP dalam Wei
- `eth_credit_wei` (TEXT): Jumlah ETH credit yang ditambahkan (dalam Wei)
- `created_at` (TIMESTAMPTZ): Timestamp konversi

### 3. Function `increment_user_credit`
Function untuk atomic increment credit balance (menghindari race condition).

**Cara Menggunakan:**
\`\`\`sql
SELECT increment_user_credit('0x1234...', '1000000000000000000');
\`\`\`

## 🔐 Security (RLS)

- **RLS Enabled**: Semua tabel memiliki Row Level Security aktif
- **Read Policy**: Users hanya bisa membaca data mereka sendiri
- **Write Policy**: Hanya service_role (via API) yang bisa insert/update

## 📝 Environment Variables

Pastikan environment variables berikut sudah di-set di `.env.local`:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://yusmynrsoplqadxukesv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c215bnJzb3BscWFkeHVrZXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5ODY5NTEsImV4cCI6MjA4MjU2Mjk1MX0.yA8iQKJkezNF_gDOER0XwVwkLqz8cvoSqDoo8UOiLno
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1c215bnJzb3BscWFkeHVrZXN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk4Njk1MSwiZXhwIjoyMDgyNTYyOTUxfQ.M4IanYhq79_Z_n-6iIdGV2_83yMiD9Ndqy2TEw4dM-s
\`\`\`

## ⚠️ Catatan Penting

1. **BigInt Handling**: Semua nilai Wei disimpan sebagai `NUMERIC(78,0)` untuk menghindari overflow
2. **RLS Bypass**: API route menggunakan `service_role` key untuk bypass RLS saat update balance
3. **Atomic Operations**: Function `increment_user_credit` memastikan atomic increment
4. **Case Sensitivity**: Semua `user_address` disimpan dalam lowercase untuk konsistensi

## 📚 File SQL

Gunakan file `DATABASE-SCHEMA.sql` untuk setup database. File tersebut berisi pure SQL code yang siap di-paste ke Supabase SQL Editor.
