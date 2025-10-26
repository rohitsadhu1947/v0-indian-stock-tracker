# Deployment Checklist - Zerodha Kite Connect

## ✅ Pre-Deployment Steps

### 1. Kite Connect Configuration

- [ ] Login to [https://kite.trade](https://kite.trade)
- [ ] Navigate to your app settings
- [ ] Update **Redirect URL** to: `https://v0-indian-stock-tracker-seven.vercel.app/api/auth/kite/callback`
- [ ] Verify API Key and Secret are correct

### 2. Environment Variables (Vercel)

Add these in Vercel Project Settings → Environment Variables:

```
KITE_API_KEY=azb90b12zqr3zeel
KITE_API_SECRET=7i3ztst4f1wmzwsxzbbyu756co9jsaom
KITE_CLIENT_ID=QUG191
NEXT_PUBLIC_APP_URL=https://v0-indian-stock-tracker-seven.vercel.app
NEXTAUTH_URL=https://v0-indian-stock-tracker-seven.vercel.app
```

Generate random secrets for:
```bash
# Generate on your terminal
openssl rand -base64 32
```

Then add:
```
NEXTAUTH_SECRET=<generated-secret-1>
SESSION_SECRET=<generated-secret-2>
```

### 3. Git Preparation

```bash
cd /Users/rohit/v0-indian-stock-tracker

# Check status
git status

# Add changes
git add .

# Commit
git commit -m "Migrate from Alpha Vantage to Zerodha Kite Connect API"

# Push to GitHub
git push origin main
```

### 4. Verify Build

```bash
npm run build
# Should complete successfully (warnings are OK)
```

## 🚀 Deployment Steps

### Option A: Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option B: Vercel Dashboard

1. Go to [https://vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Configure environment variables (see above)
4. Click **Deploy**

## ✅ Post-Deployment Verification

### 1. Test Authentication Flow

- [ ] Visit your deployed app
- [ ] Click "Login with Zerodha Kite"
- [ ] Should redirect to Zerodha login
- [ ] After login, should redirect back to app
- [ ] Verify "Connected" status shows your user ID

### 2. Test Stock Data

- [ ] Add a stock (e.g., RELIANCE)
- [ ] Verify quote loads with real-time price
- [ ] Check indicators (RSI, MACD) display
- [ ] Verify trading signal generates

### 3. Test Screener

- [ ] Click "Run Screener"
- [ ] Wait for screener to complete (2-3 minutes)
- [ ] Verify results display
- [ ] Check sorting by signal strength

### 4. Test Session

- [ ] Logout
- [ ] Login again
- [ ] Verify session persists
- [ ] Test refresh functionality

## 🔍 Troubleshooting

### Issue: "Not authenticated" error

**Solution:**
- Check environment variables are set correctly in Vercel
- Verify redirect URL matches in Kite Connect app settings
- Clear browser cookies and try again

### Issue: "Token expired" error

**Solution:**
- This is normal - Kite tokens expire daily
- User needs to logout and login again
- Consider implementing auto-refresh in future

### Issue: "Invalid symbol" error

**Solution:**
- Ensure symbol exists on selected exchange (NSE/BSE)
- Use all caps (e.g., RELIANCE not reliance)
- Check symbol spelling

### Issue: Build errors

**Solution:**
- Run `npm install` to ensure all dependencies installed
- Check TypeScript errors with `npm run build`
- Review `.env.local` for missing variables

## 📊 Monitoring

### After Deployment, Monitor:

1. **Vercel Logs**
   - Check for API errors
   - Monitor authentication flow
   - Watch for rate limit issues

2. **Kite Connect Dashboard**
   - Monitor API usage
   - Check for rate limit hits
   - Verify user authentication count

3. **User Feedback**
   - Authentication success rate
   - Data loading times
   - Signal accuracy

## 🔒 Security Checklist

- [ ] `.env.local` is in `.gitignore`
- [ ] API credentials are in Vercel environment variables only
- [ ] HTTP-only cookies enabled
- [ ] HTTPS enforced (Vercel handles this)
- [ ] Session secrets are random and secure
- [ ] No credentials in client-side code

## 📝 Important Notes

1. **Token Expiry**: Kite access tokens expire daily. Users need to re-authenticate every 24 hours.

2. **Rate Limits**: Kite Connect allows 3 requests/second. The app has built-in delays to respect this.

3. **Market Hours**: Live data only available during market hours (9:15 AM - 3:30 PM IST).

4. **Historical Data**: Updated after market close. Intraday data has delays.

5. **Session Duration**: Set to 24 hours but can be adjusted in cookie settings.

## 🎯 Next Steps

After successful deployment:

1. Test with real Zerodha account
2. Monitor API usage in Kite dashboard
3. Gather user feedback
4. Plan enhancements (WebSocket, charts, etc.)
5. Consider adding error tracking (Sentry)

## 📞 Support Resources

- **Kite API Docs**: [https://kite.trade/docs/connect/v3/](https://kite.trade/docs/connect/v3/)
- **Vercel Docs**: [https://vercel.com/docs](https://vercel.com/docs)
- **Next.js Docs**: [https://nextjs.org/docs](https://nextjs.org/docs)
- **Kite Support**: [https://kite.trade/support](https://kite.trade/support)

---

**✅ Once all items are checked, your app is ready for production!**

