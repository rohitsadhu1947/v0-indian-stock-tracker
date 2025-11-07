import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory log storage (will reset on server restart)
const logs: string[] = []
const MAX_LOGS = 100

export function addServerLog(message: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}`
  
  logs.push(logEntry)
  console.log(logEntry) // Also log to console
  
  // Keep only last 100 logs
  if (logs.length > MAX_LOGS) {
    logs.shift()
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    logs: logs.slice(-50), // Return last 50 logs
    count: logs.length
  })
}

export async function DELETE(request: NextRequest) {
  logs.length = 0
  return NextResponse.json({ success: true, message: 'Logs cleared' })
}

