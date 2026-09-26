import postgres from 'postgres';
import { KiteConnect } from 'kiteconnect';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
const OUT = '/private/tmp/claude-501/-Users-rohit/e23560c4-8883-4408-9b91-c34163c4c752/scratchpad/research/bars'; mkdirSync(OUT, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const [a] = await sql`select master_kite_token from users where role='admin' and master_kite_token is not null order by last_login desc limit 1`;
await sql.end();
const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY }); kc.setAccessToken(a.master_kite_token);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn) { for (let i = 0; i < 6; i++) { try { return await fn(); } catch (e) { if (/Token|api_key/.test(e.message)) throw e; await sleep(3000 * (i + 1)); } } throw new Error('gave up'); }
const syms = readFileSync('/private/tmp/claude-501/-Users-rohit/e23560c4-8883-4408-9b91-c34163c4c752/scratchpad/research/ind_nifty500list.csv','utf8').trim().split('\n').slice(1).map(l => l.split(',')[2]);
const inst = await retry(() => kc.getInstruments(['NSE']));
const tok = new Map(inst.map(i => [i.tradingsymbol, i.instrument_token]));
const jobs = [['NIFTY_50', 256265], ['INDIA_VIX', 264969], ['NIFTY_BANK', 260105], ...syms.map(s => [s, tok.get(s)])];
const START = new Date('2019-09-01'), END = new Date();
let done = 0, miss = [];
for (const [s, t] of jobs) {
  const f = OUT + '/' + s + '.json';
  if (existsSync(f)) { done++; continue; }
  if (!t) { miss.push(s + ':no token'); continue; }
  const all = [];
  try {
    for (let y = new Date(START); y < END; ) {
      const e = new Date(Math.min(+new Date(y).setFullYear(y.getFullYear() + 1), +END));
      const raw = await retry(() => kc.getHistoricalData(t, 'day', y, e));
      for (const b of raw) all.push([new Date(b.date).toISOString().slice(0,10), b.open, b.high, b.low, b.close, b.volume]);
      y = new Date(+e + 86400000);
      await sleep(340);
    }
    const seen = new Set(); writeFileSync(f, JSON.stringify(all.filter(r => !seen.has(r[0]) && seen.add(r[0]))));
  } catch (err) { miss.push(s + ':' + err.message); }
  if (++done % 50 === 0) console.log('progress', done, '/', jobs.length);
}
console.log('DONE', done, 'missing', miss.length, JSON.stringify(miss));
