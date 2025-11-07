/**
 * GET /api/admin/users
 * 
 * List all users (Admin only)
 */

import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/multi-user-auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  try {
    // Only admins can list users
    await requireRole('admin')
    
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        kiteUserId: users.kiteUserId,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
    
    return NextResponse.json({
      success: true,
      users: allUsers,
    })
  } catch (error: any) {
    console.error('List users error:', error)
    
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (error.message.includes('Required role')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to list users' },
      { status: 500 }
    )
  }
}

