# 🚀 Deployment Instructions for Production

## ✅ Prerequisites

Before deploying, make sure you have:
- [x] Zerodha Kite Connect App created
- [x] API Key: `azb90b12zqr3zeel`
- [x] API Secret: `7i3ztst4f1wmzwsxzbbyu756co9jsaom`
- [x] Client ID: `QUG191`
- [x] Vercel account (free tier is fine)
- [x] GitHub repository: `rohitsadhu1947/v0-indian-stock-tracker`

---

## 🌐 Step 1: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Easiest)

1. **Go to Vercel**
   - Visit: https://vercel.com
   - Login with your GitHub account

2. **Import Project**
   - Click "Add New" → "Project"
   - Select "Import Git Repository"
   - Choose `rohitsadhu1947/v0-indian-stock-tracker`
   - Click "Import"

3. **Configure Project**
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** `npm run build` (auto-filled)
   - **Output Directory:** `.next` (auto-filled)

4. **Add Environment Variables**
   Click "Environment Variables" and add these:

   ```
   KITE_API_KEY=azb90b12zqr3zeel
   KITE_API_SECRET=7i3ztst4f1wmzwsxzbbyu756co9jsaom
   KITE_CLIENT_ID=QUG191
   NEXT_PUBLIC_APP_URL=https://YOUR-APP-NAME.vercel.app
   NEXTAUTH_URL=https://YOUR-APP-NAME.vercel.app
   ```

   **Important:** Replace `YOUR-APP-NAME` with your actual Vercel URL (you'll see it after deployment)

   Generate secure secrets for production:
   ```bash
   # Run these in terminal to generate random secrets
   openssl rand -base64 32  # Use for NEXTAUTH_SECRET
   openssl rand -base64 32  # Use for SESSION_SECRET
   ```

   Add these too:
   ```
   NEXTAUTH_SECRET=<paste-generated-secret-here>
   SESSION_SECRET=<paste-generated-secret-here>
   ```

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes for build to complete
   - Note your deployment URL: `https://YOUR-APP-NAME.vercel.app`

---

### Option B: Deploy via Vercel CLI (Advanced)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
cd /Users/rohit/v0-indian-stock-tracker
vercel --prod

# Follow prompts and add environment variables when asked
```

---

## 🔐 Step 2: Update Kite Connect Redirect URL

### Critical: Update Zerodha Kite Connect App Settings

1. **Go to Kite Connect Developer Console**
   - Visit: https://developers.kite.trade/apps
   - Login with your Zerodha credentials

2. **Edit Your App**
   - Click on your app name
   - Go to "App settings"

3. **Update Redirect URL**
   - **Remove local URL:** Delete `http://localhost:3000/api/auth/kite/callback`
   - **Add production URL:** Add `https://YOUR-APP-NAME.vercel.app/api/auth/kite/callback`
   - **Important:** Use your ACTUAL Vercel URL!

4. **Save Changes**
   - Click "Update"
   - Wait 1 minute for changes to propagate

---

## 🔄 Step 3: Update Environment Variables (if needed)

If you got the wrong URL initially, update it:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Edit `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` with correct URL
3. Click "Save"
4. Go to Deployments → Click "..." on latest deployment → "Redeploy"

---

## ✅ Step 4: Test Production Deployment

### Test Authentication
1. Visit `https://YOUR-APP-NAME.vercel.app`
2. Click "Login with Kite Connect"
3. Should redirect to Kite login page
4. Login with Zerodha credentials
5. Should redirect back to your app (authenticated)

### Test Features
- ✅ Watchlist loads with stock data
- ✅ Add/remove stocks works
- ✅ Screener runs successfully
- ✅ Intraday tab shows correctly
- ✅ Demo mode works
- ✅ Intraday watchlist persists after refresh

---

## 🐛 Troubleshooting

### Issue: "Invalid redirect URL" or 404 after Kite login

**Solution:**
- Check Kite Connect redirect URL matches EXACTLY: `https://YOUR-APP-NAME.vercel.app/api/auth/kite/callback`
- No trailing slashes
- Must be HTTPS (not HTTP)
- Check for typos

### Issue: "API Key invalid"

**Solution:**
- Verify environment variables in Vercel are correct
- Redeploy after updating env vars
- Check no extra spaces in API keys

### Issue: Stocks not loading

**Solution:**
- Open browser console (F12)
- Check for API errors
- Verify you're logged in (check top of page)
- Try logging out and back in

### Issue: "This site can't be reached"

**Solution:**
- Wait 2-3 minutes after first deployment
- Clear browser cache
- Try incognito mode
- Check Vercel deployment status

---

## 🎯 Quick Deployment Checklist

Use this checklist when deploying:

- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variables added (all 7 of them)
- [ ] Deployment successful (green checkmark)
- [ ] Production URL noted
- [ ] Kite Connect redirect URL updated
- [ ] Waited 1 minute for Kite changes to propagate
- [ ] Tested login flow
- [ ] Tested stock data loading
- [ ] Tested intraday features

---

## 📝 Your Production URLs

Fill these in after deployment:

```
Production URL: https://_____________________.vercel.app
Kite Callback URL: https://_____________________.vercel.app/api/auth/kite/callback
```

---

## 🚀 Auto-Deployment (Bonus)

Vercel automatically redeploys when you push to GitHub!

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically deploys in 2-3 minutes!
```

---

## 💡 Pro Tips

1. **Use Vercel Production Domain**
   - Get a custom domain: yourapp.vercel.app → yourapp.com
   - Free SSL certificate included

2. **Monitor Deployments**
   - Check Vercel dashboard for build logs
   - Set up deployment notifications

3. **Environment-Specific Configs**
   - Use different API keys for staging vs production
   - Test on preview deployments before production

4. **Backup Strategy**
   - Keep .env.local file secure (never commit it!)
   - Store secrets in password manager
   - Document your setup

---

## 📞 Need Help?

If deployment fails:
1. Check Vercel build logs
2. Verify all environment variables
3. Check Kite Connect app settings
4. Try redeploying

---

**Ready to deploy? Follow Step 1 above!** 🚀

