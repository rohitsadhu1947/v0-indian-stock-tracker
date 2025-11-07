
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🐛 TRADE NOW SLOW - DEBUGGING GUIDE                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

🔍 WHAT WE CHANGED:
═══════════════════════════════════════════════════════════

1. Reduced minScore: 60 → 45 (more lenient)
2. Reduced maxSignals: 50 → 30 (scan fewer stocks)
3. Added quickScan=true (faster mode)
4. Added 60-second timeout
5. Added timing logs for each step

📊 HOW TO DEBUG:
═══════════════════════════════════════════════════════════

STEP 1: Check Server Console (Terminal)
────────────────────────────────────────────────────────────
Look for these logs:

🎯 === TRADE NOW SCANNER STARTED ===
👤 User ID: <number>
💰 Capital available: ₹300,000
📊 Minimum score: 75
📈 Step 1: Running momentum scanner...
🔗 Calling: http://localhost:3000/api/scanner/momentum?...
✅ Found X momentum signals in Ys
📊 Step 2: Fetching analyst reports...
✅ Found X analyst reports in Ys
🎯 Step 3: Calculating master scores...
✅ Calculated X master scores in Ys

WHERE IS IT STUCK?
────────────────────────────────────────────────────────────
If you see:
  • "Step 1: Running..." but no "Found X signals"
    → Momentum scanner is hanging

  • "Step 3: Calculating..." but no "Calculated"
    → Master scorer is slow (fetching fundamentals)

  • No logs at all
    → Auth issue or request not reaching API

STEP 2: Check Browser Console (F12)
────────────────────────────────────────────────────────────
Look for:
  • Network tab → /api/scanner/trade-now
  • Status: Pending? 200? 500?
  • Time: How long is it taking?
  • Response: Any error messages?

STEP 3: Check for Common Issues
────────────────────────────────────────────────────────────
Issue: Network timeout
  → Check if you're connected to internet
  → Check if Kite API is accessible
  → Try refreshing the page

Issue: Database slow
  → Check if PostgreSQL is running
  → Check connection string in .env.local

Issue: Too many API calls
  → quickScan should reduce this
  → Check rate limits

🔧 QUICK FIXES TO TRY:
═══════════════════════════════════════════════════════════

FIX 1: Restart Everything
────────────────────────────────────────────────────────────
Terminal 1 (kill server):
  Ctrl+C
  lsof -ti:3000 | xargs kill -9
  lsof -ti:3001 | xargs kill -9
  npm run dev

Browser:
  Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
  Clear cache and reload

FIX 2: Test API Directly
────────────────────────────────────────────────────────────
curl -v "http://localhost:3000/api/scanner/momentum?quickScan=true&maxSignals=10"

If this hangs too, the issue is in momentum scanner, not Trade Now.

FIX 3: Reduce Load Even More
────────────────────────────────────────────────────────────
Edit app/api/scanner/trade-now/route.ts:
  Line 54: Change maxSignals=30 to maxSignals=10
  Save and let server reload

FIX 4: Check Environment Variables
────────────────────────────────────────────────────────────
Verify in .env.local:
  DATABASE_URL=<your-neon-db-url>
  KITE_API_KEY=<your-key>
  KITE_API_SECRET=<your-secret>

🧪 TEST ENDPOINTS INDIVIDUALLY:
═══════════════════════════════════════════════════════════

Test 1: Auth
────────────────────────────────────────────────────────────
curl "http://localhost:3000/api/auth/session"

Expected: 200 OK with user data
If 401: Login again

Test 2: Momentum Scanner (Minimal)
────────────────────────────────────────────────────────────
curl "http://localhost:3000/api/scanner/momentum?quickScan=true&maxSignals=5"

Expected: 200 OK in 5-10 seconds
If slow: Issue is in momentum scanner itself

Test 3: Trade Now (With Logs)
────────────────────────────────────────────────────────────
curl -v "http://localhost:3000/api/scanner/trade-now?capital=300000"

Watch terminal for step-by-step logs
Note which step hangs

📋 REPORT BACK:
═══════════════════════════════════════════════════════════

Please share:
  1. Which step is hanging? (from terminal logs)
  2. Any error messages? (from terminal or browser)
  3. How long does it hang before timeout?
  4. Does momentum scanner work alone?

Example response:
  "Terminal shows Step 1 started but never completes.
   No error messages. Hangs for 3+ minutes.
   Browser shows 'Pending' in network tab."

💡 MOST LIKELY CAUSES:
═══════════════════════════════════════════════════════════

1. Momentum Scanner Itself is Slow
────────────────────────────────────────────────────────────
   Solution: We'll add caching or reduce universe

2. Fundamental API Calls Timing Out
────────────────────────────────────────────────────────────
   Solution: Skip fundamentals or use cached data

3. Kite API Rate Limiting
────────────────────────────────────────────────────────────
   Solution: Add delays between calls

4. Database Connection Issue
────────────────────────────────────────────────────────────
   Solution: Check Neon DB status

═══════════════════════════════════════════════════════════

🎯 NEXT STEPS:
1. Check terminal logs → Tell me which step hangs
2. Try curl tests → See if momentum scanner works alone
3. We'll optimize the slow part specifically

═══════════════════════════════════════════════════════════

