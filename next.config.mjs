import { createRequire } from 'module'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PENTING: Inilah kunci memperbaiki error 'in operator' di Next.js 16
  transpilePackages: [
    'viem', 
    'permissionless', 
    'ox', 
    '@uniswap/v4-sdk', 
    '@abstract-foundation/agw-client'
  ],
  
  typescript: {
    ignoreBuildErrors: true, // Menjaga agar build tetap lanjut meski ada mismatch type
  },
  
  images: {
    unoptimized: true,
  },

  async redirects() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination: 'https://api.farcaster.xyz/miniapps/hosted-manifest/019b6904-aa9c-a5cf-d965-ccddf734f08e',
        permanent: false,
      },
    ]
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Menyediakan fallback kosong untuk modul nodejs di browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        os: false,
        // Fix MetaMask SDK build error - ignore async-storage
        '@react-native-async-storage/async-storage': false,
      }
    }
    return config
  },
}

export default nextConfig
