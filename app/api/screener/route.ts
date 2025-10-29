import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, screenerResults } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

async function getUserIdFromCookie(): Promise<number | null> {
  const cookieStore = cookies();
  const kiteUserId = cookieStore.get('kite_user_id')?.value;
  if (!kiteUserId) return null;

  const user = await db.select().from(users).where(eq(users.kiteUserId, kiteUserId)).limit(1);
  return user.length > 0 ? user[0].id : null;
}

// GET: Fetch recent screener results for the user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const screenerType = searchParams.get('type'); // 'morning', 'evening', 'orb', 'universe'
    const limit = parseInt(searchParams.get('limit') || '10');

    let query = db.select().from(screenerResults).where(eq(screenerResults.userId, userId));

    if (screenerType) {
      query = db.select().from(screenerResults).where(
        and(
          eq(screenerResults.userId, userId),
          eq(screenerResults.screenerType, screenerType)
        )
      );
    }

    const results = await query.orderBy(desc(screenerResults.runAt)).limit(limit);

    return NextResponse.json({ 
      success: true, 
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Error fetching screener results:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch screener results' }, { status: 500 });
  }
}

// POST: Save new screener results
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { screenerType, screenerLevel, results, totalStocks, signalCount } = await request.json();

    if (!screenerType || !results) {
      return NextResponse.json({ 
        success: false, 
        error: 'screenerType and results are required' 
      }, { status: 400 });
    }

    const [newResult] = await db.insert(screenerResults).values({
      userId,
      screenerType,
      screenerLevel: screenerLevel || null,
      results,
      totalStocks: totalStocks || results.length,
      signalCount: signalCount || 0,
      runAt: new Date(),
    }).returning();

    console.log(`✅ Saved ${screenerType} screener results (${totalStocks} stocks, ${signalCount} signals) for user ${userId}`);

    return NextResponse.json({ 
      success: true, 
      result: newResult,
      message: `Screener results saved successfully`
    });
  } catch (error) {
    console.error('Error saving screener results:', error);
    return NextResponse.json({ success: false, error: 'Failed to save screener results' }, { status: 500 });
  }
}

// DELETE: Clear old screener results (older than N days)
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const daysOld = parseInt(searchParams.get('days') || '7'); // Default: delete results older than 7 days

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deleted = await db.delete(screenerResults).where(
      and(
        eq(screenerResults.userId, userId),
        // Delete results older than cutoff date
        // @ts-ignore - Drizzle doesn't have type for < operator
        db.sql`${screenerResults.runAt} < ${cutoffDate}`
      )
    );

    return NextResponse.json({ 
      success: true, 
      message: `Deleted screener results older than ${daysOld} days`
    });
  } catch (error) {
    console.error('Error deleting screener results:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete screener results' }, { status: 500 });
  }
}

