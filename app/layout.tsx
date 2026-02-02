import type React from "react"
import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import { PrivyProvider } from "@/components/privy-provider"
import "./globals.css"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clawdbump.vercel.app"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "ClawdBump - Token Bump Bot",
  description: "Professional HFT Token Bump Bot on Base Network",
  generator: "v0.app",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
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
    title: "ClawdBump",
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
        <meta name="apple-mobile-web-app-title" content="ClawdBump" />
      </head>
      <body className={`${jetbrainsMono.variable} font-mono antialiased`}>
        <PrivyProvider>
          {children}
          <Toaster position="top-center" richColors />
          <Analytics />
        </PrivyProvider>
      </body>
    </html>
  )
}
