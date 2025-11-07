/**
 * PATCH /api/admin/users/[userId]
 * 
 * Update user status or details (Admin only)
 */

import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/multi-user-auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Only admins can update users
    await requireRole('admin')
    
    const { userId } = await params
    const userIdNum = parseInt(userId)
    
    if (isNaN(userIdNum)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }
    
    const body = await request.json()
    const { status, role, name } = body
    
    // Build update object
    const updates: any = {}
    if (status) updates.status = status
    if (role) updates.role = role
    if (name !== undefined) updates.name = name
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }
    
    await db.update(users).set(updates).where(eq(users.id, userIdNum))
    
    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
    })
  } catch (error: any) {
    console.error('Update user error:', error)
    
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
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

