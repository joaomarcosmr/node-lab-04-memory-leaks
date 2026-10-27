// Hammers each endpoint, forces a GC, and checks that heap/RSS do not keep growing. Server must be running with --expose-gc.
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const PER_ROUND = Number(process.env.PER_ROUND ?? 2000);
const WORDS = ['lamp', 'camera', 'bottle', 'speaker', 'monitor', 'charger', 'keyboard', 'backpack', 'notebook', 'headphones'];

const health = async () => { const h = await (await fetch(`${BASE}/health`)).json(); h.managedMb = +(h.heapUsedMb + (h.externalMb ?? 0)).toFixed(1); return h; };
const gc = async () => { const r = await fetch(`${BASE}/debug/gc`); if (!r.ok) throw new Error('/debug/gc failed — start the server with --expose-gc (npm start)'); };

async function hammer(round) {
  const tasks = []; const per = PER_ROUND / 50;
  const run = async (fn) => { for (let i = 0; i < per; i++) await fn(i); };
  for (let c = 0; c < 50; c++) {
    // distinct 3-digit prefixes → each query matches a handful of products
    tasks.push(run(async (i) => { const n = 100 + ((round * 977 + c * 40 + i) % 900); await (await fetch(`${BASE}/products/search?q=${WORDS[(c + i) % WORDS.length]}%20${n}`)).json(); }));
    tasks.push(run(async (i) => { await (await fetch(`${BASE}/products/${1 + ((c * 97 + i * 13) % 50000)}`)).json(); }));
    tasks.push(run(async (i) => { await (await fetch(`${BASE}/uploads`, { method: 'POST', headers: { 'x-session-id': `s-${round}-${c}-${i}`, 'content-type': 'application/octet-stream' }, body: Buffer.alloc(16 * 1024, 1) })).json(); }));
    tasks.push(run(async () => { await (await fetch(`${BASE}/stats`)).json(); }));
  }
  await Promise.all(tasks);
}

const first = await health();
if (typeof first.heapUsedMb !== 'number') { console.error('/health must return heapUsedMb and rssMb'); process.exit(1); }
console.log(`warm-up round against ${BASE}...`);
await hammer(0); await gc(); await new Promise((r) => setTimeout(r, 500));
const base = await health();
console.log(`after warm-up + GC: heap+external ${base.managedMb} MB, rss ${base.rssMb} MB, listeners ${base.listeners}, cache ${base.cacheSize}`);
let last = base, crashed = false;
try {
  for (let r = 1; r <= ROUNDS; r++) {
    await hammer(r); await gc(); await new Promise((res) => setTimeout(res, 500));
    last = await health();
    console.log(`round ${r}: heap+external ${last.managedMb} MB (+${(last.managedMb - base.managedMb).toFixed(1)}), rss ${last.rssMb} MB, listeners ${last.listeners}, cache ${last.cacheSize}`);
  }
} catch (e) { crashed = true; console.log(`request failed (${e.cause?.code ?? e.message}) — did the server die?`); }
const heapGrowth = last.managedMb - base.managedMb, rssGrowth = last.rssMb - base.rssMb;
const checks = [
  ['server survived the whole run', !crashed],
  [`heap + external growth after ${ROUNDS * PER_ROUND * 4} requests < 20 MB (got ${heapGrowth.toFixed(1)} MB)`, heapGrowth < 20],
  [`RSS growth < 100 MB (got ${rssGrowth.toFixed(1)} MB)`, rssGrowth < 100],
  [`event listeners on CatalogEvents do not accumulate (got ${last.listeners})`, last.listeners < 50],
  [`search cache is bounded (got ${last.cacheSize} entries)`, last.cacheSize <= 1000],
];
console.log('');
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
