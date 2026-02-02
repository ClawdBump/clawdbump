import type React from "react"
import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import { PrivyProvider } from "@/components/privy-provider"
import { MiniAppProvider } from "@/components/miniapp-provider"
import "./globals.css"

// CRITICAL: Initialize environment variables at top level (before any component or function)
// This prevents "Cannot access before initialization" errors in production
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://farbump.vercel.app"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

// CRITICAL: Initialize frameEmbed at top level to prevent initialization errors
const frameEmbed = {
  version: "next",
  imageUrl: `${APP_URL}/farbump-logo.png`,
  button: {
    title: "Bump!",
    action: {
      type: "launch_frame",
      url: APP_URL,
      name: "FarBump",
      splashImageUrl: `${APP_URL}/farbump-logo.png`,
      splashBackgroundColor: "#000000"
    }
  }
}

export const metadata: Metadata = {
  title: "FarBump - Token Bump Bot",
  description: "Professional HFT Token Bump Bot on Base Network",
  generator: "v0.app",
  icons: {
    icon: "/farbump-logo.png",
    apple: "/farbump-logo.png",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  },
  themeColor: "#000000",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FarBump",
  },
  other: {
    "base:app_id": "697774113a92926b661fd68f",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FarBump" />
        <meta 
          name="fc:frame" 
          content={JSON.stringify(frameEmbed)}
        />
        {/* Preconnect to Quick Auth server for better performance */}
        {/* Based on: https://miniapps.farcaster.xyz/docs/sdk/quick-auth */}
        <link rel="preconnect" href="https://auth.farcaster.xyz" />
      </head>
      <body className={`${jetbrainsMono.variable} font-mono antialiased`}>
        <MiniAppProvider>
          <PrivyProvider>
            {children}
            <Toaster position="top-center" richColors />
            <Analytics />
          </PrivyProvider>
        </MiniAppProvider>
      </body>
    </html>
  )
}
