# 📱 Telegram Alerts - Setup & Usage Guide

## Overview

The Telegram Alerts system sends real-time trading notifications directly to your phone via Telegram Bot. You'll receive instant alerts for:

- 🔥 **New High-Conviction Signals** - When the scanner finds strong trading opportunities
- ✅ **Target Hits** - When your positions reach profit targets
- ❌ **Stop-Loss Hits** - Urgent alerts when positions hit stop-loss (protect your capital!)
- 📊 **Daily Summary** - End-of-day P&L report with win rate and statistics
- 📝 **Position Updates** - Optional notifications for all position changes

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat and send `/newbot`
3. Follow the prompts:
   - Choose a name for your bot (e.g., "My Stock Tracker Bot")
   - Choose a username (e.g., "my_stock_tracker_bot")
4. **Copy the bot token** (it looks like `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Connect Your Bot

1. **Start a chat with your new bot** (click the link provided by BotFather)
2. Send any message to your bot (e.g., `/start` or "Hello")
3. In the Indian Stock Tracker app, go to **⚙️ Settings** tab
4. Paste your bot token
5. Click **🔗 Connect Telegram**
6. You should receive a confirmation message in Telegram!

### Step 3: Customize Alert Preferences

In the Settings tab, toggle which alerts you want to receive:

- ✅ **New Signals** - Recommended for active traders
- ✅ **Target Hits** - Know when to book profits
- ✅ **Stop-Loss Hits** - Critical for risk management
- ✅ **Daily Summary** - Great for end-of-day review
- ⬜ **Position Updates** - Can be noisy, only enable if needed

---

## 📱 Alert Types & Examples

### 1. New High-Conviction Signal

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
1. Blue Chip: ₹1.27K Cr, ROE 17.6%, P/E 5.9, D/E N/A
2. BUY signal (72/100 momentum)
3. RSI 65.3 - bullish momentum

⏰ 03-11-2025, 10:15:30 AM
```

### 2. Target Hit Alert

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

⏰ 03-11-2025, 1:00:15 PM
```

### 3. Stop-Loss Hit Alert

```
❌ STOP-LOSS HIT: IDBI

🚨 EXIT IMMEDIATELY!

Entry: ₹102.50
Current: ₹99.95
Stop Loss: ₹100.18

Loss: -₹1,275.00 (-2.49%)
Quantity: 500 shares
Holding Time: 1h 15m

💡 Accept the loss and move on. Protect your capital.

⏰ 03-11-2025, 11:30:45 AM
```

### 4. Daily Summary Report

```
📊 DAILY REPORT - Sunday, 3 November 2025

🟢 Total P&L: +₹12,450.00 (+4.15%)

📈 TRADES:
Total: 5
Wins: 3 ✅
Losses: 2 ❌
Win Rate: 60.0%

🏆 Biggest Winner: CANBK (+₹4,132.50)
💔 Biggest Loser: IDBI (-₹1,275.00)

📊 CAPITAL:
Deployed: ₹150,500 (3 positions)
Available: ₹149,500

⏰ 03-11-2025, 3:30:00 PM
```

---

## ⚙️ Configuration

### Alert Preferences

| Alert Type | Description | Recommended |
|------------|-------------|-------------|
| **New Signals** | Notifies when high-conviction trading opportunities are found | ✅ Yes |
| **Target Hits** | Alerts when positions reach profit targets (T1 or T2) | ✅ Yes |
| **Stop-Loss Hits** | **Critical!** Immediate alert when stop-loss is hit | ✅ Absolutely! |
| **Daily Summary** | End-of-day P&L report (sent at market close) | ✅ Yes |
| **Position Updates** | All position changes (can be noisy) | ⬜ Optional |

### Spam Protection

To avoid overwhelming you with notifications:
- **New Signals**: Only top 3 high-conviction signals are sent (score ≥ 85)
- **Target Hits**: One alert per target level (T1, T2)
- **Stop-Loss**: One alert per position
- **Daily Summary**: Once per day (3:30 PM IST)

---

## 🔧 Troubleshooting

### "Could not get chat ID" Error

**Solution:** You need to send at least one message to your bot first.

1. Open your bot in Telegram
2. Click "START" or send any message (like "Hello")
3. Then try connecting again in the app

### "Connection test failed" Error

**Possible causes:**
- Invalid bot token (double-check for typos)
- Bot was deleted or disabled by BotFather
- Internet connection issues

**Solution:** 
1. Go back to BotFather
2. Send `/mybots` → Select your bot → API Token
3. Copy the token again and try reconnecting

### Not Receiving Alerts

**Check these:**
1. ✅ Is Telegram connected? (Green status in Settings)
2. ✅ Are alerts enabled? (Toggle in Settings)
3. ✅ Are specific alert types enabled? (Check checkboxes)
4. ✅ Did you block or mute the bot in Telegram?
5. ✅ Is the auto P&L update running? (Check Momentum tab - toggle "Auto-Update P&L")

### Testing Alerts

To test if alerts are working:
1. Go to **⚙️ Settings** tab
2. Scroll down to "📱 Send Test Summary" button
3. Click it - you should receive a daily summary in Telegram within 5-10 seconds

---

## 🔐 Privacy & Security

### Is my bot token safe?

- ✅ Bot tokens are stored securely in your database
- ✅ Only you can access your bot (via your unique chat ID)
- ✅ The app never logs or shares your token
- ⚠️ Never share your bot token publicly (treat it like a password)

### What data is sent to Telegram?

Only the following is sent:
- Stock symbols and prices
- Your P&L and position data
- Trade signals and recommendations

**Nothing else** is shared. No personal information, no passwords, no API keys.

### Can I revoke access?

Yes! Two ways:
1. **In the app:** Go to Settings → Click "🔌 Disconnect"
2. **In Telegram:** Go to BotFather → `/mybots` → Select your bot → Delete Bot

---

## 📊 Best Practices

### 1. Keep Alerts Minimal

- Only enable alerts you'll actually act on
- Disable "Position Updates" unless you need granular tracking
- Use "Daily Summary" for review, not real-time monitoring

### 2. Set Up Notification Sounds

In Telegram:
1. Open your bot chat
2. Click the bot name → Notifications
3. Set custom sound for "Target Hits" and "Stop-Loss Hits"
4. Use a subtle sound for "New Signals"

### 3. Use Telegram Desktop for Analysis

- Install Telegram Desktop on your PC
- Keep bot chat open in a separate window
- Easy to copy trade details and execute orders

### 4. Create Alert Groups (Advanced)

If you have multiple trading strategies:
1. Create separate bots for each strategy
2. Example: "Momentum Bot", "Swing Bot", "News Bot"
3. Connect different bots to different scanning intervals

---

## 🤖 Automation Tips

### Scheduled Daily Summary

The daily summary is sent automatically at 3:30 PM IST (market close).

To change the timing:
1. Set up a cron job or scheduled task
2. Call: `GET /api/reports/daily-summary`
3. Example (Linux): `0 15 * * 1-5 curl http://localhost:3000/api/reports/daily-summary`

### Auto P&L Updates

For alerts to work, P&L updates must be running:
1. Go to **💰 Momentum** tab
2. Toggle "🔄 Auto-Update P&L" to ON
3. P&L updates every 5 minutes (checks target/stop-loss hits)

### Real-Time Monitoring

For instant alerts:
1. Enable auto P&L updates (as above)
2. Keep the app open in a browser tab
3. Telegram will buzz your phone when alerts trigger

---

## 🎯 Next Steps

After setting up Telegram alerts, consider:

1. **Backtest your strategy** - Run historical simulations to validate signals
2. **Set capital limits** - Already implemented! (₹3 lakhs default)
3. **Add trailing stop-loss** - Future feature to lock in profits
4. **Enable paper trading** - Test signals without real money
5. **Go live** - Connect Kite API for real order placement

---

## 📞 Support

Having issues? Check:

1. **Logs** - Check browser console (F12) for errors
2. **Database** - Ensure `user_preferences` table has Telegram columns
3. **Network** - Verify your server can reach `api.telegram.org`
4. **Migration** - Run `npx drizzle-kit push` to update database

---

## 🚀 What's Next?

Now that you have alerts, you're ready for:

### Phase 2 Features:
- **Opening Range Breakout (ORB)** - Better entry timing
- **News Sentiment** - Real-time news-driven trades
- **Portfolio Heatmap** - Visual sector exposure
- **Backtesting Engine** - Prove your strategy works

### Phase 3 Features:
- **Live Trading** - One-click execution on Kite
- **Trailing Stop-Loss** - Protect winners automatically
- **Basket Orders** - Execute multiple trades simultaneously
- **Performance Analytics** - Sharpe ratio, Sortino, Calmar

---

**🎉 Congratulations! You're now set up for real-time trading alerts. Happy trading! 🚀**

