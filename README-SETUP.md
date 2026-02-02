# FarBump - Farcaster Mini App Setup

FarBump adalah Farcaster Mini App (Frames v2) untuk High-Frequency Token Bumping di Base Network.

## 🚀 Fitur Utama

- **Farcaster Mini App Integration**: Terintegrasi dengan Warpcast mobile app
- **Privy Authentication**: Login dengan Farcaster dan Smart Wallet creation
- **Account Abstraction**: Smart Wallets di Base Network
- **Mobile-First Design**: Optimized untuk Warpcast webview
- **Supabase Integration**: Sistem '$BUMP to Credit' untuk fuel management

## 📦 Dependencies

Aplikasi ini menggunakan:
- Next.js 16
- Privy (@privy-io/react-auth, @privy-io/wagmi)
- Wagmi & Viem untuk Web3
- Supabase untuk database
- TanStack Query untuk data fetching

## ⚙️ Environment Variables

Buat file `.env.local` di root project dengan variabel berikut:

\`\`\`env
# Privy Configuration
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id-here

# Supabase Configuration (jika diperlukan)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
\`\`\`

## 🔧 Setup Privy Dashboard

1. **Login ke Privy Dashboard**: https://dashboard.privy.io
2. **Aktifkan Farcaster Login**:
   - Settings → Authentication → Login Methods
   - Enable "Farcaster"
3. **Aktifkan Smart Wallets untuk Base Network**:
   - Settings → Wallets → Smart Wallets
   - Enable untuk Base Network (Chain ID: 8453)
4. **Copy App ID** ke environment variable

## 📱 Farcaster Mini App Configuration

1. **Update Manifest**: Edit `public/.well-known/farcaster.json`
   - Ganti `your-domain.com` dengan domain production Anda
   - Update icon dan screenshot URLs

2. **Deploy ke Production**: 
   - Pastikan file `.well-known/farcaster.json` accessible di `https://your-domain.com/.well-known/farcaster.json`
   - Warpcast akan membaca manifest ini untuk mengkonfigurasi Mini App

## 🎨 Mobile Optimization

Aplikasi sudah dioptimasi untuk mobile dengan:
- Viewport meta tags untuk webview
- Safe area insets untuk notched devices
- Touch-friendly button sizes (min 44x44px)
- Responsive design dengan Tailwind CSS
- Smooth scrolling dan overscroll prevention

## 🔐 Authentication Flow

1. User membuka Mini App di Warpcast
2. `MiniAppProvider` mendeteksi context Farcaster
3. `useFarcasterAuth` hook auto-login dengan Privy menggunakan Farcaster
4. Privy membuat Embedded Wallet + Smart Wallet otomatis
5. User siap menggunakan aplikasi dengan wallet di Base Network

## 📚 Hooks & Components

### `useFarcasterAuth()`
Hook untuk mengakses Farcaster context dan Privy authentication:
\`\`\`tsx
const { 
  isInWarpcast, 
  farcasterUser, 
  isAuthenticated, 
  user 
} = useFarcasterAuth()
\`\`\`

### `useFarcasterMiniApp()`
Hook untuk mengakses Farcaster Mini App context:
\`\`\`tsx
const { context, isReady, isInWarpcast } = useFarcasterMiniApp()
\`\`\`

## 🚢 Deployment

1. Build aplikasi: `npm run build`
2. Deploy ke hosting (Vercel, Netlify, dll)
3. Update `farcaster.json` dengan production URLs
4. Test di Warpcast mobile app

## 📝 Notes

- Aplikasi akan tetap berfungsi di browser biasa (non-Warpcast) untuk development
- Smart Wallets harus diaktifkan di Privy Dashboard untuk Base Network
- Pastikan domain production sudah di-whitelist di Privy Dashboard jika diperlukan
