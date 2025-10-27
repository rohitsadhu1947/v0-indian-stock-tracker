import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// NIFTY 500 stocks (popular intraday stocks)
// In production, this would be fetched from Kite instruments list
const NIFTY_500_SYMBOLS = [
  // Large Caps
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL',
  'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA', 'TITAN', 'BAJFINANCE',
  'ULTRACEMCO', 'NESTLEIND', 'WIPRO', 'ADANIENT', 'HCLTECH', 'TATAMOTORS', 'ONGC', 'NTPC',
  'POWERGRID', 'M&M', 'JSWSTEEL', 'TATASTEEL', 'INDUSINDBK', 'TECHM', 'HINDALCO', 'BAJAJFINSV',
  'GRASIM', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'BRITANNIA', 'CIPLA', 'BPCL', 'TATACONSUM',
  
  // Mid Caps (High Volume)
  'ADANIPORTS', 'ADANIGREEN', 'ADANITRANS', 'TATAPOWER', 'VEDL', 'ZEEL', 'SAIL', 'IRCTC',
  'IRFC', 'PNB', 'BANKBARODA', 'CANBK', 'IOC', 'GAIL', 'DLF', 'GODREJCP', 'HAVELLS',
  'PIDILITIND', 'BAJAJ-AUTO', 'DIVISLAB', 'GLAND', 'LUPIN', 'BIOCON', 'AUROPHARMA',
  'TORNTPHARM', 'APOLLOHOSP', 'FORTIS', 'MAXHEALTH', 'LICI', 'SBILIFE', 'HDFCLIFE',
  'ICICIPRULI', 'PNBHOUSING', 'LICHSGFIN', 'MFSL', 'CHOLAFIN', 'RECLTD', 'PFC',
  
  // Small Caps (High Volatility - Good for Intraday)
  'SUZLON', 'YESBANK', 'ZOMATO', 'PAYTM', 'NYKAA', 'POLICYBZR', 'RBLBANK', 'IDFCFIRSTB',
  'FEDERALBNK', 'BANDHANBNK', 'PVR', 'INOXLEISUR', 'JUBLFOOD', 'DELTACORP', 'GRAPHITE',
  'IRCON', 'RVNL', 'NBCC', 'BEL', 'HAL', 'SJVN', 'NHPC', 'NMDC', 'MOIL',
  'RPOWER', 'JSWENERGY', 'ADANIPOWER', 'JPPOWER', 'GMRINFRA', 'L&TFH', 'RAYMOND',
  'PGEL', 'JINDALSTEL', 'JSWSTEELNSE', 'JINDALSTAINLESS', 'APARINDS', 'BALKRISIND',
  
  // Sector Specific (Auto, Pharma, IT, Banking)
  'ESCORTS', 'ASHOKLEY', 'MOTHERSON', 'BOSCHLTD', 'MRF', 'APOLLOTYRE', 'CEAT', 'JK TYRE',
  'GRANULES', 'CAPLIN', 'LALPATHLAB', 'METROPOLIS', 'THYROCARE', 'PERSISTENT', 'COFORGE',
  'LTTS', 'LTIM', 'MPHASIS', 'MINDTREE', 'OFSS', 'UNIONBANK', 'INDIANB', 'CENTRALBK',
  
  // Additional Popular Intraday Stocks
  'ACC', 'AMBUJA', 'UPL', 'DABUR', 'MARICO', 'COLPAL', 'PGHH', 'MCDOWELL-N', 'ABFRL',
  'TRENT', 'VMART', 'SHOPERSTOP', 'DIXON', 'AMBER', 'CUMMINS', 'VOLTAS', 'BLUESTAR',
  'WHIRLPOOL', 'CROMPTON', 'POLYCAB', 'KEI', 'APLAPOLLO', 'RATNAMANI', 'DEEPAKNTR',
  'AARTI', 'ALKYLAMINE', 'SRF', 'GNFC', 'CHAMBLFERT', 'COROMANDEL', 'PIIND', 'SYNGENE',
  'DIVI', 'NATCOPHARMA', 'ALKEM', 'ABBOTINDIA', 'GLAXO', 'PFIZER', 'SANOFI', 'EIDPARRY',
  'BALRAMCHIN', 'DCM SHRIRAM', 'GSPL', 'GUJGASLTD', 'IGL', 'MGL', 'PETRONET', 'ATGL'
];

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    // In production, fetch instruments from Kite API
    // For now, return the curated list
    const universe = NIFTY_500_SYMBOLS.map(symbol => ({
      tradingsymbol: symbol,
      instrument_token: 0, // Would be fetched from Kite
      exchange: 'NSE'
    }));

    return NextResponse.json({
      success: true,
      data: universe,
      count: universe.length
    });

  } catch (error: any) {
    console.error('Universe fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch universe' },
      { status: 500 }
    );
  }
}

