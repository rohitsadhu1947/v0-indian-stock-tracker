# 📰 Analyst Reports System - Testing Guide

## ✅ What's Built

### 1. Database Schema
- `analyst_reports` table with full structure
- Stores: symbol, rating, target price, sentiment, PDF path, structured data (JSONB)
- Supports both STOCK_REPORT and MARKET_COMMENTARY types

### 2. API Endpoints
**Upload:** `POST /api/reports/upload`
**Fetch:** `GET /api/reports/upload?symbol=INFY&limit=10`

### 3. PDF Parsing
- **Gemini AI**: Smart extraction of target price, rating, key points
- **Regex Parser**: HDFC Securities-specific patterns (fallback)
- Extracts: Symbol, Rating, Target Price, Current Price, Upside %, Key Points

### 4. Storage
- PDFs saved locally: `/public/uploads/reports/`
- Full text + structured data in database

---

## 🧪 How to Test

### Method 1: Browser Test Page
1. **Open:** http://localhost:3000/test-reports
2. **Select** a PDF file (HDFC Securities analyst report)
3. **Click** "Upload & Parse Report"
4. **Check** results displayed on page
5. **Click** "Fetch All Reports" to see all uploaded reports

### Method 2: Manual Upload
```bash
curl -X POST http://localhost:3000/api/reports/upload \
  -F "file=@/path/to/your/report.pdf" \
  -F "type=STOCK_REPORT" \
  -F "source=HDFC Securities" \
  -H "Cookie: kite_user_id=YOUR_USER_ID; kite_access_token=YOUR_TOKEN"
```

### Method 3: Browser Console
```javascript
// Open DevTools Console, paste this:
const input = document.createElement('input')
input.type = 'file'
input.accept = '.pdf'
input.onchange = async (e) => {
  const formData = new FormData()
  formData.append('file', e.target.files[0])
  formData.append('type', 'STOCK_REPORT')
  formData.append('source', 'HDFC Securities')
  
  const res = await fetch('/api/reports/upload', {
    method: 'POST',
    body: formData
  })
  console.log(await res.json())
}
input.click()
```

---

## 📊 What Gets Extracted

### For Stock Reports (HDFC Securities):
```json
{
  "symbol": "INFY",
  "companyName": "Infosys Limited",
  "rating": "BUY",
  "targetPrice": 1850,
  "currentPrice": 1650,
  "upside": 12.1,
  "analystName": "Pradeep Kumar",
  "keyPoints": [
    "Strong Q3 results",
    "Cloud growth accelerating"
  ],
  "risks": ["Competition", "Attrition"]
}
```

### For Market Commentary (Perplexity):
```json
{
  "marketSentiment": "BULLISH",
  "sectorsBullish": ["IT", "Banking"],
  "sectorsBearish": ["FMCG"],
  "keyThemes": ["Rate cuts expected"],
  "macroOutlook": "Positive outlook"
}
```

---

## 🔍 Verification Steps

### 1. Check Upload
```bash
ls -lh public/uploads/reports/
# Should see your uploaded PDFs
```

### 2. Check Database
```sql
SELECT 
  id, symbol, title, source, sentiment, 
  report_date, created_at
FROM analyst_reports
ORDER BY created_at DESC
LIMIT 5;
```

### 3. Check Structured Data
```sql
SELECT 
  symbol,
  structured_data->>'rating' as rating,
  structured_data->>'targetPrice' as target,
  structured_data->>'upside' as upside
FROM analyst_reports
WHERE symbol = 'INFY';
```

### 4. Test Fetch API
```bash
# Fetch all reports
curl http://localhost:3000/api/reports/upload?limit=10

# Fetch for specific symbol
curl http://localhost:3000/api/reports/upload?symbol=INFY

# Fetch market commentary only
curl "http://localhost:3000/api/reports/upload?type=MARKET_COMMENTARY"
```

---

## 🐛 Troubleshooting

### Issue: "Not authenticated"
**Solution:** Login to the app first to get auth cookies

### Issue: "Failed to extract text from PDF"
**Solution:** Check if PDF is valid, not password-protected

### Issue: Symbol not detected
**Solution:** 
- If using Gemini AI: Check API key in `.env.local`
- If using regex: Format might not match HDFC pattern

### Issue: PDF not saved
**Solution:** Check directory permissions:
```bash
mkdir -p public/uploads/reports
chmod 755 public/uploads/reports
```

---

## 📝 Sample HDFC Report Format

For best results, HDFC reports should have:
```
Company: Infosys Limited (INFY)
Rating: BUY
Current Price: ₹1,650
Target Price: ₹1,850

Key Highlights:
• Point 1
• Point 2
```

---

## ✅ Next Steps

1. ✅ Test with real HDFC Securities PDF
2. ✅ Verify symbol extraction works
3. ✅ Check sentiment analysis
4. ⏳ Build UI integration (momentum scanner shows reports)
5. ⏳ Add more broker formats (ICICI, Motilal Oswal)
6. ⏳ Integrate with signals (show reports for each stock)

---

## 📞 Quick Commands

```bash
# Start server
npm run dev

# Test page
open http://localhost:3000/test-reports

# Check logs
tail -f .next/server/app/api/reports/upload/route.js

# Clear test data
rm public/uploads/reports/*.pdf
```

---

## 🎯 Success Criteria

- [ ] Upload PDF successfully
- [ ] Symbol extracted correctly
- [ ] Rating extracted (BUY/HOLD/SELL)
- [ ] Target price extracted
- [ ] Sentiment calculated (BULLISH/NEUTRAL/BEARISH)
- [ ] PDF viewable at `/uploads/reports/{filename}.pdf`
- [ ] Data in database with correct structure

**Status:** ✅ Ready for testing!

