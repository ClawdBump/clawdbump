import { NextRequest, NextResponse } from "next/server"

// Cache ETH price for 5 minutes to reduce API calls
// ETH price doesn't change drastically in short periods, so longer cache is safe
let cachedPrice: { price: number; timestamp: number } | null = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes (300000 ms)

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * API Route to fetch ETH price from CoinGecko
 * Server-side proxy to avoid CORS and rate limiting issues
 * 
 * Features:
 * - Server-side fetch (no CORS issues)
 * - 5-minute caching to reduce API calls (ETH price doesn't change drastically)
 * - CoinGecko API key support (if provided) for higher rate limits
 * - Graceful error handling with cached fallback
 * - Returns price in USD
 */
export async function GET(request: NextRequest) {
  try {
    // Check if we have a valid cached price
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        price: cachedPrice.price,
        cached: true,
        timestamp: cachedPrice.timestamp,
      })
    }

    // Prepare CoinGecko API URL and headers
    const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY // Server-side only
    const apiUrl = new URL('https://api.coingecko.com/api/v3/simple/price')
    apiUrl.searchParams.set('ids', 'ethereum')
    apiUrl.searchParams.set('vs_currencies', 'usd')
    
    const headers: HeadersInit = {
      Accept: "application/json",
    }
    
    // Add API key header if available (for higher rate limits)
    // CoinGecko uses x-cg-pro-api-key header for API key authentication
    if (COINGECKO_API_KEY) {
      headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
    }

    // Fetch fresh price from CoinGecko
    const priceResponse = await fetch(apiUrl.toString(), {
      headers,
      // Add cache to reduce requests
      next: { revalidate: 300 }, // Revalidate every 5 minutes (matches CACHE_DURATION)
    })

    if (!priceResponse.ok) {
      // If we have a cached price, return it even if expired
      if (cachedPrice) {
        console.warn(
          `⚠️ CoinGecko API error (${priceResponse.status}), using cached price`
        )
        return NextResponse.json({
          success: true,
          price: cachedPrice.price,
          cached: true,
          stale: true,
          timestamp: cachedPrice.timestamp,
        })
      }

      // No cached price available, return error
      return NextResponse.json(
        {
          success: false,
          error: `CoinGecko API error: ${priceResponse.status} ${priceResponse.statusText}`,
        },
        { status: priceResponse.status }
      )
    }

    const priceData = await priceResponse.json()
    const ethPriceUsd = priceData.ethereum?.usd

    if (!ethPriceUsd || typeof ethPriceUsd !== "number") {
      // If we have a cached price, return it
      if (cachedPrice) {
        console.warn("⚠️ Invalid price data from CoinGecko, using cached price")
        return NextResponse.json({
          success: true,
          price: cachedPrice.price,
          cached: true,
          stale: true,
          timestamp: cachedPrice.timestamp,
        })
      }

      return NextResponse.json(
        {
          success: false,
          error: "Invalid price data from CoinGecko API",
        },
        { status: 500 }
      )
    }

    // Update cache
    cachedPrice = {
      price: ethPriceUsd,
      timestamp: Date.now(),
    }

    return NextResponse.json({
      success: true,
      price: ethPriceUsd,
      cached: false,
      timestamp: cachedPrice.timestamp,
    })
  } catch (error: any) {
    console.error("❌ Error fetching ETH price:", error)

    // If we have a cached price, return it even on error
    if (cachedPrice) {
      console.warn("⚠️ Error fetching ETH price, using cached price")
      return NextResponse.json({
        success: true,
        price: cachedPrice.price,
        cached: true,
        stale: true,
        timestamp: cachedPrice.timestamp,
      })
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch ETH price",
      },
      { status: 500 }
    )
  }
}

