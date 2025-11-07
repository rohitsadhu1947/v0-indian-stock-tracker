# Telegram Alerts - Quick Start Guide

## ✅ Step 1: Database (DONE!)
Database migration complete - 4 new columns added to `user_preferences` table.

## 📱 Step 2: Create Telegram Bot (5 min)

1. **Open Telegram** → Search `@BotFather`
2. **Send:** `/newbot`
3. **Choose name:** "My Stock Tracker Bot"
4. **Choose username:** "my_stock_tracker_bot" (must end with "bot")
5. **Copy your bot token** (looks like: `1234567890:ABCdef...`)
6. **Click the bot link** BotFather gives you
7. **Send a message** to your bot (click START or type "Hello")
   - ⚠️ This step is REQUIRED!

## 🔗 Step 3: Connect in App (2 min)

1. **Refresh your app** (loads new Settings tab)
2. **Click "⚙️ Settings"** tab (far right)
3. **Paste bot token** in the text field
4. **Click "🔗 Connect Telegram"**
5. **Check Telegram** - you should get a confirmation message!

## 🎯 Step 4: Configure Alerts (1 min)

In Settings tab, toggle which alerts you want:
- ✅ **New Signals** - When high-conviction trades found
- ✅ **Target Hits** - When to book profits
- ✅ **Stop-Loss Hits** - CRITICAL - urgent exit alerts
- ✅ **Daily Summary** - End-of-day P&L report
- ⬜ **Position Updates** - Optional (can be noisy)

Click **"💾 Save Preferences"**

## 🧪 Step 5: Test (1 min)

Click **"📱 Send Test Summary"** button in Settings.

You should receive a message in Telegram within 10 seconds!

## 🚀 Step 6: Enable Auto P&L (Required)

For target/stop-loss alerts to work:
1. Go to **"💰 Momentum"** tab
2. Toggle **"🔄 Auto-Update P&L"** ON
3. Now alerts will trigger every 5 minutes

## 🎉 Done!

You'll now get real-time alerts for:
- 🔥 New trading signals
- ✅ Target hits → book profit
- ❌ Stop-loss hits → exit now
- 📊 Daily summary

---

## 📱 What Alerts Look Like

### New Signal Alert
```
🔥 NEW SIGNAL: CANBK

Score: 89/100 (HIGH_CONVICTION)
Exchange: NSE

📊 TRADE PLAN:
Entry: ₹105.50
Stop Loss: ₹102.87 (-2.49%)
Target 1: ₹109.74 (+4.02%)
Target 2: ₹113.98 (+8.04%)

Position Size: 950 shares
Capital Required: ₹100,225
Max Risk: ₹2,498.50
Risk:Reward: 1:2.5

💡 WHY THIS TRADE?
1. Blue Chip stock
2. Strong momentum
3. Good fundamentals

⏰ 10:15 AM
```

### Target Hit Alert
```
✅ TARGET 1 HIT: CANBK

🎯 BOOK PROFIT NOW!

Entry: ₹105.50
Current: ₹109.85
Target: ₹109.74

P&L: ₹4,132.50 (+4.12%)
Quantity: 950 shares
Holding Time: 2h 45m

💡 Suggested Action:
Book 50% profit, trail stop-loss to breakeven

⏰ 1:00 PM
```

---

## 🆘 Troubleshooting

**"Could not get chat ID"**
→ Make sure you sent a message to your bot first!

**"Connection test failed"**
→ Check bot token for typos, ensure bot isn't deleted

**Not receiving alerts**
→ Check:
1. Settings tab shows "🟢 Connected"
2. Alerts are enabled (toggle ON)
3. Auto P&L is enabled in Momentum tab
4. Bot isn't muted/blocked in Telegram

---

## 📚 Full Documentation

See `TELEGRAM_ALERTS_GUIDE.md` for comprehensive docs, examples, and advanced features.

---

**Ready? Go create your bot and connect it! 🚀**

