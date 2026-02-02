import { NextRequest, NextResponse } from "next/server"
import "dotenv/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Paymaster Proxy API Route
 * 
 * This endpoint acts as a proxy between the frontend and Coinbase CDP Paymaster.
 * It forwards JSON-RPC 2.0 requests to the CDP Paymaster service to bypass
 * client-side allowlist restrictions.
 * 
 * Security Pass-through:
 * - Only allows Paymaster methods: pm_getPaymasterStubData, pm_getPaymasterData
 * - Validates JSON-RPC 2.0 structure
 * - Forwards requests to CDP_PAYMASTER_URL from environment
 * - Adds trusted server headers for Paymaster requests
 * 
 * Environment Variables Required:
 * - CDP_PAYMASTER_URL: Full URL to CDP Paymaster service
 *   Format: https://api.developer.coinbase.com/rpc/v1/base/{API_KEY}
 */
export async function POST(request: NextRequest) {
  try {
    // Get CDP Paymaster URL from environment (secret API key)
    const cdpPaymasterUrl = process.env.CDP_PAYMASTER_URL

    if (!cdpPaymasterUrl) {
      console.error("❌ CDP_PAYMASTER_URL not configured in environment variables")
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Paymaster service not configured",
            data: "CDP_PAYMASTER_URL environment variable is missing",
          },
        },
        { status: 500 }
      )
    }

    // Parse request body
    let requestBody: any
    try {
      requestBody = await request.json()
    } catch (parseError) {
      console.error("❌ Invalid JSON in request body:", parseError)
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
            data: "Invalid JSON in request body",
          },
        },
        { status: 400 }
      )
    }

    // =============================================
    // Security Pass-through: Validate JSON-RPC Structure
    // =============================================
    if (!requestBody || typeof requestBody !== "object") {
      console.error("❌ Invalid request body structure")
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: requestBody?.id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
            data: "Request body must be a valid JSON-RPC object",
          },
        },
        { status: 400 }
      )
    }

    // Validate JSON-RPC version
    if (requestBody.jsonrpc !== "2.0") {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: requestBody.id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
            data: "Only JSON-RPC 2.0 is supported",
          },
        },
        { status: 400 }
      )
    }

    // =============================================
    // Security Pass-through: Only Allow Paymaster Methods
    // =============================================
    const method = requestBody.method
    const allowedMethods = [
      "pm_getPaymasterStubData",
      "pm_getPaymasterData",
    ]

    if (!method || !allowedMethods.includes(method)) {
      console.warn(`⚠️ Unauthorized method: ${method}`)
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: requestBody.id || null,
          error: {
            code: -32601,
            message: "Method not found",
            data: `Method '${method}' is not allowed through this proxy. Only Paymaster methods are allowed.`,
          },
        },
        { status: 400 }
      )
    }

    // Log request (without sensitive data)
    console.log(`\n📤 Paymaster Proxy Request:`)
    console.log(`   → Method: ${method}`)
    console.log(`   → Request ID: ${requestBody.id || "N/A"}`)

    // =============================================
    // Prepare Headers for Trusted Server Request
    // =============================================
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    // Add trusted server headers for Paymaster requests
    // These headers help simulate a request from a trusted server
    if (method === "pm_getPaymasterStubData" || method === "pm_getPaymasterData") {
      headers["User-Agent"] = "FarBump-Server/1.0"
      headers["X-Requested-With"] = "XMLHttpRequest"
      headers["Origin"] = request.headers.get("origin") || "https://farbump.vercel.app"
      headers["Referer"] = request.headers.get("referer") || "https://farbump.vercel.app"
      
      // Add server identification headers
      headers["X-Server-Proxy"] = "true"
      headers["X-Proxy-Version"] = "1.0"
      
      console.log(`   → Added trusted server headers for ${method}`)
    }

    // =============================================
    // Forward Request to CDP Paymaster
    // =============================================
    console.log(`   → Forwarding to CDP Paymaster...`)
    console.log(`   → CDP URL: ${cdpPaymasterUrl.replace(/\/rpc\/v1\/base\/[^/]+/, "/rpc/v1/base/***")}`)

    try {
      const paymasterResponse = await fetch(cdpPaymasterUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      })

      // Get response body
      const responseData = await paymasterResponse.json()

      // =============================================
      // Log Response - Especially for Allowlist Errors
      // =============================================
      if (paymasterResponse.ok && !responseData.error) {
        console.log(`   ✅ Paymaster response: SUCCESS`)
      } else {
        console.error(`   ❌ Paymaster response: ERROR`)
        
        // Log full response for debugging
        console.log(`\n=====================================`)
        console.log(`📋 FULL COINBASE RESPONSE (JSON):`)
        console.log(`=====================================`)
        console.log(JSON.stringify(responseData, null, 2))
        console.log(`=====================================\n`)

        if (responseData.error) {
          console.error(`   → Error Code: ${responseData.error.code}`)
          console.error(`   → Error Message: ${responseData.error.message}`)
          if (responseData.error.data) {
            console.error(`   → Error Data: ${responseData.error.data}`)
          }
          
          // Check for allowlist error
          const errorMessage = responseData.error.message || ""
          const errorData = responseData.error.data || ""
          const isAllowlistError = 
            errorMessage.includes("not in allowlist") ||
            errorMessage.includes("allowlist") ||
            errorMessage.includes("address not in allowlist") ||
            errorData.includes("not in allowlist") ||
            errorData.includes("allowlist")

          if (isAllowlistError) {
            console.error(`\n🚨 ALLOWLIST ERROR DETECTED!`)
            console.error(`   → This indicates the address is not in Coinbase Paymaster allowlist`)
            console.error(`   → Full error response logged above`)
            
            // Check for Policy ID in response
            if (responseData.error.data) {
              const errorDataStr = JSON.stringify(responseData.error.data)
              if (errorDataStr.includes("policy") || errorDataStr.includes("Policy") || errorDataStr.includes("policyId")) {
                console.error(`   → ⚠️ Policy ID may be present in error.data - check full JSON above`)
              }
            }
            
            // Check entire response for Policy ID
            const fullResponseStr = JSON.stringify(responseData)
            if (fullResponseStr.includes("policy") || fullResponseStr.includes("Policy") || fullResponseStr.includes("policyId")) {
              console.error(`   → ⚠️ Policy ID found in response - check full JSON above`)
            }
          }
        }
      }

      // Return the response from CDP Paymaster with appropriate status code
      return NextResponse.json(responseData, {
        status: paymasterResponse.status,
        headers: {
          "Content-Type": "application/json",
        },
      })
    } catch (fetchError: any) {
      console.error("❌ Error forwarding to CDP Paymaster:", fetchError.message)
      console.error("   → Full error:", JSON.stringify(fetchError, null, 2))
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: requestBody.id || null,
          error: {
            code: -32603,
            message: "Internal error",
            data: `Failed to connect to Paymaster service: ${fetchError.message}`,
          },
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("❌ Unexpected error in Paymaster Proxy:", error)
    console.error("   → Full error:", JSON.stringify(error, null, 2))
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Internal error",
          data: error.message || "Unexpected error occurred",
        },
      },
      { status: 500 }
    )
  }
}
