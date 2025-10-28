/**
 * Database Client for Indian Stock Tracker
 * Neon PostgreSQL with Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Create postgres client
// For queries: Use pooled connection
const connectionString = process.env.DATABASE_URL

// Create connection pool
const client = postgres(connectionString, {
  max: 10, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
})

// Create Drizzle instance
export const db = drizzle(client, { schema })

// Export schema for use in queries
export { schema }

// Helper function to close connection (useful for testing)
export async function closeConnection() {
  await client.end()
}

// Export types
export type Database = typeof db

