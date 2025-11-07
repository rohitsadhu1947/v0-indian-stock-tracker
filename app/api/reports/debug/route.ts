import { NextRequest, NextResponse } from 'next/server'

// Simple endpoint to check if Gemini is configured
export async function GET(request: NextRequest) {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY
  const keyPreview = process.env.GEMINI_API_KEY 
    ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` 
    : 'Not set'

  return NextResponse.json({
    geminiConfigured: hasGeminiKey,
    keyPreview,
    message: hasGeminiKey 
      ? '✅ Gemini API key is configured' 
      : '❌ Gemini API key is NOT configured'
  })
}

