# Fix RLS Policy untuk Error 406 (Not Acceptable)

## 🔴 Masalah

Error **406 (Not Acceptable)** terjadi saat fetch ke tabel `user_credits` karena RLS (Row Level Security) policy menggunakan `auth.uid()`, padahal aplikasi menggunakan **wallet address** (bukan Supabase Auth).

## ✅ Solusi

Update RLS policy di Supabase untuk allow public read access dengan filter `user_address` di application code.

## 📋 Langkah-langkah

### 1. Buka Supabase SQL Editor

1. Login ke [Supabase Dashboard](https://app.supabase.com)
2. Pilih project Anda
3. Buka **SQL Editor** di sidebar kiri

### 2. Jalankan SQL untuk Update RLS Policy

Copy dan paste SQL berikut ke SQL Editor:

\`\`\`sql
-- Fix RLS Policy untuk user_credits table
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code

-- Fix RLS Policy untuk conversion_logs table
DROP POLICY IF EXISTS "Users can view own conversion logs" ON conversion_logs;
CREATE POLICY "Users can view own conversion logs"
  ON conversion_logs
  FOR SELECT
  USING (true); -- Allow public read - filtering by user_address is done in application code
\`\`\`

### 3. Verifikasi

Setelah menjalankan SQL, coba fetch data lagi dari aplikasi. Error 406 seharusnya sudah teratasi.

## 🔒 Keamanan

- **Public Read Access**: Policy ini mengizinkan public read, tapi filtering tetap dilakukan di application code via `.eq("user_address", userAddress.toLowerCase())`
- **Write Protection**: Insert/Update tetap menggunakan service role client yang bypass RLS
- **Alternative**: Jika ingin lebih secure, bisa menggunakan JWT claims dengan wallet address, tapi memerlukan setup tambahan

## 📝 Catatan

- Policy ini cocok untuk aplikasi yang menggunakan wallet address (bukan Supabase Auth)
- Filtering berdasarkan `user_address` dilakukan di application code, bukan di database level
- Service role client tetap digunakan untuk write operations (bypass RLS)

## ✅ Checklist

- [ ] SQL dijalankan di Supabase SQL Editor
- [ ] Policy `Users can view own credits` sudah diupdate
- [ ] Policy `Users can view own conversion logs` sudah diupdate
- [ ] Test fetch data dari aplikasi - Error 406 sudah teratasi
- [ ] Verifikasi query masih menggunakan `.eq("user_address", ...)` di application code









