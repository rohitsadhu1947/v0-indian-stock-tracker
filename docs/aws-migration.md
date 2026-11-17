# Moving Vibe Trades to AWS

A step by step runbook for moving the app, the database and all market data from Vercel, Neon and a laptop to AWS.

Written on 17 November 2026 against `main` at commit `3dcb3d6`. Sizes and settings below were read from the live project on that date.

Items marked **Check** have not been verified and need confirming during the work.

---

## 1. Target layout

Everything runs in **AWS Mumbai (`ap-south-1`)**. NSE and BSE often refuse requests from foreign servers, so an Indian region matters.

| Part | Today | On AWS |
|---|---|---|
| Web app and API | Vercel | One EC2 server running Next.js behind Caddy |
| Scheduled jobs | Vercel cron, up to an hour late on the free plan | systemd timers on the same server |
| Database | Neon PostgreSQL 17, about 170 MB | RDS PostgreSQL 17 |
| Raw NSE files | Laptop, 659 MB | S3 |
| Research store (SQLite) | Laptop, 780 MB | S3, pulled to the server when backtests run |
| Database backups | Laptop, 27 MB | S3, plus RDS automated backups |
| Filings collector | Not built yet | A second service on the same server (section 13) |

Why one server and not Amplify, Fargate and EventBridge: this is a single user app with three scheduled jobs and one planned background worker. One server is cheaper and has fewer parts to wire together. The cost is that someone patches the server, and there are no automatic preview builds for pull requests.

---

## 2. What exists today

**Code**
- Repo: `github.com/rohitsadhu1947/v0-indian-stock-tracker` (private), branch `main`.
- Next.js 14.2 (App Router), TypeScript, Drizzle ORM with the `postgres` driver.
- Node 24 is used locally. The data scripts need Node 22.5 or later because they use the built in `node:sqlite` module.
- Native dependency: `canvas`. **Check** that it installs on the chosen server image (see step 6).

**Scheduled jobs** (all are `GET` routes that need the header `Authorization: Bearer $CRON_SECRET`)

| Route | Time (IST) | Days | What it does |
|---|---|---|---|
| `/api/cron/morning-note` | 08:30 | Mon to Fri | Catches up on NSE price files, then sends the Telegram morning note |
| `/api/cron/end-of-day` | 15:25 | Mon to Fri | Paper trade exit checks, provisional prices from Kite, portfolio snapshots |
| `/api/cron/market-data` | 20:30 | Mon to Fri | Loads NSE's official end of day file, applies corporate actions, saves month end picks |

**Database**
- PostgreSQL 17 on Neon. Largest table is `daily_bars`, about 1.08 million rows.
- Schema is in `db/schema.ts`. Hand written migrations are in `db/migrations/manual/` (`0003` to `0007`), all already applied.

**Data on the laptop** (folder `data/`, not in git)

| Path | Size | Notes |
|---|---|---|
| `data/nse/raw/` | 659 MB | NSE daily archive files from January 2010. Slow to download again (about an hour). |
| `data/market.db` | 780 MB | SQLite research store built from the raw files. Can be rebuilt in about 15 minutes. |
| `data/cache/` | 260 MB | Rebuilt automatically. Do not copy. |
| `data/backup/` | 27 MB | Snapshots of `daily_bars` taken before each publish. |

**Environment variables the code reads**

| Name | Needed | Where the value is today |
|---|---|---|
| `DATABASE_URL` | Yes | Will be new (RDS) |
| `DATABASE_URL_UNPOOLED` | Yes, used by scripts | Will be new. Same value as `DATABASE_URL` on RDS. |
| `SESSION_SECRET` | Yes | Vercel and local `.env.local` |
| `CRON_SECRET` | Yes | **Vercel only** (Production). Copy it from the Vercel dashboard. |
| `KITE_API_KEY`, `KITE_API_SECRET` | Yes | Vercel and local `.env.local` |
| `NEXT_PUBLIC_APP_URL` | Yes | Will be the new address |
| `GEMINI_API_KEY` | Optional | Vercel, if set |
| `LOG_LEVEL` | Optional | Defaults to `info` |
| `NODE_ENV` | Yes | `production` |

Telegram bot tokens are stored per user in the database, not in the environment.

**Outside services the app calls**
- `nsearchives.nseindia.com` (daily price and corporate action files)
- `api.kite.trade` and `kite.zerodha.com` (Zerodha Kite Connect)
- `api.telegram.org`
- Google Gemini, Google News RSS, Yahoo Finance (news and fundamentals)

---

## 3. Decisions needed before starting

1. **Domain.** The app needs HTTPS, so it needs a domain or subdomain. Example: `trades.yourdomain.com`.
2. **Monthly budget.** See section 12. A billing alert will be set at this figure.
3. **Who owns the AWS account** and who gets access.
4. **Server size.** A small server runs the app. A medium one also runs backtests comfortably.

---

## 4. Step 0: test that NSE can be reached from AWS Mumbai

Do this first. If it fails, the nightly price job cannot live on AWS and the plan needs to change.

Start any small throwaway instance in `ap-south-1` and run:

```bash
UA="indian-stock-tracker/1.0 (personal research; daily archive files)"
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -A "$UA" \
  https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR111126.zip
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -A "$UA" \
  https://nsearchives.nseindia.com/archives/equities/mto/MTO_11112026.DAT
curl -s -o /dev/null -w "%{http_code}\n" https://api.kite.trade
```

**Pass:** the first two return `200` with a size above 100,000 bytes. The third returns any HTTP status (it proves the host is reachable).

**Fail:** `403`, a timeout, or a tiny HTML page. If so, stop and report back. Options would be a different address range, or keeping only the nightly job outside AWS.

Do not add browser cookies or a browser user agent to get past a block. The app uses the plain user agent above on purpose.

---

## 5. Step 1: account and access

1. Turn on two factor sign in for the root login. Do not use root for anything below.
2. Create an admin user through IAM Identity Center (or an IAM user with MFA) for the tech lead.
3. Create an **AWS Budget** with an email alert at the agreed monthly figure.
4. Tag everything created below with `project=vibe-trades`.

---

## 6. Step 2: network and security groups

The default VPC in `ap-south-1` is fine.

| Security group | Inbound | Purpose |
|---|---|---|
| `vibe-app` | 80 and 443 from anywhere | The web server |
| `vibe-db` | 5432 from `vibe-app` only | The database |

Do not open port 22. Use **SSM Session Manager** to get a shell on the server.

---

## 7. Step 3: S3 bucket

1. Create one private bucket, for example `vibe-trades-data-<account-id>`, in `ap-south-1`.
2. Block all public access. Turn on versioning and default encryption.
3. Copy the laptop data up. Run this on the laptop, from the project folder:

```bash
aws s3 sync data/nse/raw s3://BUCKET/nse/raw
aws s3 cp data/nse/manifest.json s3://BUCKET/nse/manifest.json
aws s3 cp data/nse/symbolchange.csv s3://BUCKET/nse/symbolchange.csv
aws s3 cp data/nse/eq_etfseclist.csv s3://BUCKET/nse/eq_etfseclist.csv
aws s3 sync data/nse/lists s3://BUCKET/nse/lists
aws s3 cp data/market.db s3://BUCKET/store/market.db
aws s3 sync data/backup s3://BUCKET/backups/daily_bars
```

4. Check the count: `data/nse/raw` held 17,432 files across 17 year folders on 17 November 2026.

---

## 8. Step 4: database (RDS)

**Create**
- Engine: PostgreSQL 17 (same major version as Neon).
- Class: `db.t4g.micro` to start. Move to `db.t4g.small` if it feels slow.
- Storage: 20 GB gp3, with storage autoscaling on.
- Single AZ. Not publicly accessible. Security group `vibe-db`.
- Automated backups: 7 days. Deletion protection: on.
- Database name `vibetrades`, and a dedicated user for the app.

**Copy the data.** Run from the EC2 server (step 5), since RDS is not public. Use the Neon **unpooled** connection string as the source:

```bash
pg_dump "$NEON_UNPOOLED_URL" --format=custom --no-owner --no-privileges -f vibetrades.dump
pg_restore --no-owner --no-privileges -d "$RDS_URL" vibetrades.dump
```

Use `pg_dump` and `pg_restore` version 17.

**Verify.** Run on both databases and compare:

```sql
select count(*), max(date) from daily_bars;
select count(*) from corporate_actions;
select count(*) from securities;
select count(*) from monthly_signals;
select count(*) from users;
select count(*) from paper_positions;
```

**Connection string for the app.** It must ask for SSL, because the app does not set it in code:

```
postgresql://USER:PASSWORD@HOST:5432/vibetrades?sslmode=require
```

Set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to this value.

---

## 9. Step 5: the server (EC2)

**Create**
- Type: `t4g.small` (2 GB memory) for the app alone. Use `t4g.medium` (4 GB) if backtests will run on it; loading the research data takes over 1 GB of memory.
- Image: Ubuntu 24.04 LTS, arm64.
- Disk: 40 GB gp3.
- Security group `vibe-app`. Attach an Elastic IP.
- Instance profile with: `AmazonSSMManagedInstanceCore`, and read and write on the S3 bucket from step 3.

**Install**

```bash
sudo timedatectl set-timezone Asia/Kolkata
sudo apt-get update && sudo apt-get install -y git build-essential postgresql-client-17 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

The `lib*-dev` packages are there in case `canvas` has to compile. **Check** that `npm ci` finishes without errors on arm64.

**Deploy the app**

```bash
sudo useradd --system --create-home --shell /bin/bash vibe
sudo -iu vibe
git clone https://github.com/rohitsadhu1947/v0-indian-stock-tracker.git app
cd app
```

The repo is private, so use a read only deploy key or a fine grained token for the clone.

Create `/etc/vibe-trades.env` (owner `root`, group `vibe`, mode `640`):

```
NODE_ENV=production
DATABASE_URL=postgresql://...?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://...?sslmode=require
SESSION_SECRET=...
CRON_SECRET=...
KITE_API_KEY=...
KITE_API_SECRET=...
NEXT_PUBLIC_APP_URL=https://trades.yourdomain.com
GEMINI_API_KEY=...
```

Build. The build needs `DATABASE_URL` to be set, so load the file first:

```bash
set -a && . /etc/vibe-trades.env && set +a
npm ci
npm run build
```

**Run it as a service.** Create `/etc/systemd/system/vibe-trades.service`:

```ini
[Unit]
Description=Vibe Trades web app
After=network-online.target

[Service]
User=vibe
WorkingDirectory=/home/vibe/app
EnvironmentFile=/etc/vibe-trades.env
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now vibe-trades
curl -s http://127.0.0.1:3000/api/health
```

**HTTPS.** Install Caddy and put this in `/etc/caddy/Caddyfile`. Caddy gets and renews the certificate on its own.

```
trades.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

Point the domain's `A` record at the Elastic IP before starting Caddy.

HTTPS is required, not optional: in production the app only sends its session cookie over HTTPS.

**Later deploys**

```bash
cd /home/vibe/app && git pull && npm ci && npm run build && sudo systemctl restart vibe-trades
```

---

## 10. Step 6: scheduled jobs

The server clock is set to IST in step 5, so times below are IST.

Create `/usr/local/bin/vibe-cron`:

```bash
#!/bin/bash
set -a && . /etc/vibe-trades.env && set +a
curl -s --max-time 280 -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/$1" >> /var/log/vibe-cron.log 2>&1
echo " [$(date '+%F %T') $1]" >> /var/log/vibe-cron.log
```

Then `sudo chmod 750 /usr/local/bin/vibe-cron` and add to root's crontab:

```
30 8  * * 1-5 /usr/local/bin/vibe-cron morning-note
25 15 * * 1-5 /usr/local/bin/vibe-cron end-of-day
30 20 * * 1-5 /usr/local/bin/vibe-cron market-data
30 22 * * 1-5 /usr/local/bin/vibe-cron market-data
```

The 22:30 line is a second attempt in case NSE publishes late. The job is safe to run twice.

Each run of `market-data` writes a row to the `market_data_runs` table. Admin users with Telegram set up get a message when a run fails.

---

## 11. Cutover

Do this outside market hours, ideally on a weekend.

1. Build everything above while Vercel and Neon keep running. Test the AWS app on its own address.
2. In the Zerodha Kite developer console, change the app's redirect URL to `https://trades.yourdomain.com/api/auth/kite/callback`. Only the Kite account owner can do this.
3. Take a final `pg_dump` from Neon and restore it to RDS, replacing the test copy.
4. **Stop Vercel's scheduled jobs.** Remove the `crons` block from `vercel.json` and deploy, or pause the Vercel project. If both schedulers run, the Telegram morning note goes out twice.
5. Point the domain at AWS (if it was pointing at Vercel).
6. Leave Vercel and Neon untouched for one week as a fallback. Then cancel them.

**Checks after cutover**

- [ ] `https://trades.yourdomain.com/api/health` returns 200.
- [ ] Email sign in works.
- [ ] "Sign in with Zerodha Kite" completes and returns to the new address.
- [ ] Monthly Plan loads, shows "Prices current to" the latest trading day, and lists 20 orders for each mode.
- [ ] The "Live record" card shows the picks saved for 30 October 2026.
- [ ] Paper Trades tab lists the existing positions.
- [ ] Run `/usr/local/bin/vibe-cron market-data` by hand. A new row appears in `market_data_runs` with `ok = true`.
- [ ] The next evening, `daily_bars` has rows for that day's date.

**Rollback.** Point the domain back at Vercel, restore the `crons` block in `vercel.json`, and change the Kite redirect URL back. Neon still has the data as of the final dump. Anything written to RDS after cutover would need copying back by hand.

---

## 12. Cost

Rough monthly figures in US dollars. **Check** each against the AWS pricing calculator for `ap-south-1` before creating anything; these are from memory.

| Item | Estimate |
|---|---|
| RDS `db.t4g.micro`, 20 GB | about 15 |
| EC2 `t4g.small` with 40 GB disk | about 15 |
| EC2 `t4g.medium` instead of small | about 28 |
| S3, about 2 GB | under 1 |
| Data transfer, Elastic IP, backups | a few dollars |
| **Total** | **about 30 to 55** |

A new AWS account may have free tier credits that cover part of the first year.

---

## 13. Running the research tools on the server (optional)

The backtests can stay on the laptop. To run them on the server instead:

```bash
cd /home/vibe/app && mkdir -p data
aws s3 sync s3://BUCKET/nse data/nse
aws s3 cp s3://BUCKET/store/market.db data/market.db
set -a && . /etc/vibe-trades.env && set +a

npm run data:sync      # download new NSE days, rebuild the store
npm run research       # backtest every strategy, writes research/results/
npm run data:publish   # replace daily_bars in Postgres with adjusted prices
```

Notes:
- `npm run data:publish` **replaces** `daily_bars`, `corporate_actions` and `securities` in one transaction. It saves the old rows to `data/backup/` first. Treat it as a production change.
- It publishes the last 3 years by default (`--years=3`). That limit was set for Neon's size cap. On RDS it can be raised, which is a product decision, not a technical one.
- After `data:sync`, copy the new raw files and store back to S3 so the bucket stays the source of truth:

```bash
aws s3 sync data/nse s3://BUCKET/nse && aws s3 cp data/market.db s3://BUCKET/store/market.db
```

---

## 14. Planned next: the filings collector

Not built yet. It is listed here so the server is sized and set up with it in mind.

- An always on worker that polls BSE's announcement feed every few seconds, saves each filing with its timestamp to Postgres, and sends Telegram alerts.
- It will run as a second systemd service on the same server.
- It needs outbound access to `api.bseindia.com` and `www.bseindia.com`. **Check** these from Mumbai during step 0:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.bseindia.com/
```

---

## 15. Open items

| Item | Status |
|---|---|
| NSE archive reachable from AWS Mumbai | Not tested. Step 0. |
| `canvas` installs on Ubuntu arm64 | Not tested. Step 5. |
| Prices in section 12 | Estimates. Confirm in the calculator. |
| Automatic deploys from GitHub | Not set up. Manual `git pull` for now. GitHub Actions with OIDC and SSM is the usual next step. |
| Monitoring | Only the `market_data_runs` table and Telegram failure alerts exist. A CloudWatch alarm on instance status and disk space is worth adding. |
| Secrets | In a root owned env file. SSM Parameter Store is the tidier option if more people get access. |

---

## 16. What the account owner must do personally

These cannot be delegated to the tech lead:

1. Change the redirect URL in the Zerodha Kite developer console.
2. Copy `CRON_SECRET` out of the Vercel dashboard (Settings, Environment Variables, Production).
3. Approve the monthly budget.
4. Cancel Vercel and Neon after the fallback week.
