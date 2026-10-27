// Hammers each endpoint, forces a GC, and checks that heap/RSS do not keep growing.
// Run with the server already started via `npm start` (needs --expose-gc for /debug/gc).
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const PER_ROUND = Number(process.env.PER_ROUND ?? 2000);

const health = async () => (await fetch(`${BASE}/health`)).json();
const gc = async () => { const r = await fetch(`${BASE}/debug/gc`); if (!r.ok) throw new Error('/debug/gc failed — start the server with --expose-gc'); };

async function hammer(round) {
  const tasks = [];
  const run = async (fn) => { for (let i = 0; i < PER_ROUND / 50; i++) await fn(i); };
  for (let c = 0; c < 50; c++) {
    tasks.push(run(async (i) => { await (await fetch(`${BASE}/search?q=query-${round}-${c}-${i}`)).json(); }));
    tasks.push(run(async (i) => { await (await fetch(`${BASE}/items?id=${c}-${i}`)).json(); }));
    tasks.push(run(async (i) => { await (await fetch(`${BASE}/upload`, { method: 'POST', headers: { 'x-session-id': `s-${round}-${c}-${i}` }, body: Buffer.alloc(16 * 1024, 1) })).json(); }));
    tasks.push(run(async () => { await (await fetch(`${BASE}/stats`)).json(); }));
  }
  await Promise.all(tasks);
}

const first = await health();
if (typeof first.heapUsedMb !== 'number') { console.error('/health must return heapUsedMb and rssMb'); process.exit(1); }

console.log(`warm-up round against ${BASE}...`);
await hammer(0); await gc(); await new Promise((r) => setTimeout(r, 500));
const base = await health();
console.log(`after warm-up + GC: heapUsed ${base.heapUsedMb} MB, rss ${base.rssMb} MB, listeners ${base.listeners}, cache ${base.cacheSize}`);

let last = base;
let crashed = false;
try {
  for (let r = 1; r <= ROUNDS; r++) {
    await hammer(r); await gc(); await new Promise((res) => setTimeout(res, 500));
    last = await health();
    console.log(`round ${r}: heapUsed ${last.heapUsedMb} MB (+${(last.heapUsedMb - base.heapUsedMb).toFixed(1)}), rss ${last.rssMb} MB, listeners ${last.listeners}, cache ${last.cacheSize}`);
  }
} catch (e) {
  crashed = true;
  console.log(`request failed (${e.cause?.code ?? e.message}) — did the server die? check its output.`);
}

const heapGrowth = last.heapUsedMb - base.heapUsedMb;
const rssGrowth = last.rssMb - base.rssMb;
const checks = [
  ['server survived the whole run', !crashed],
  [`heapUsed growth after ${ROUNDS * PER_ROUND * 4} requests < 15 MB (got ${heapGrowth.toFixed(1)} MB)`, heapGrowth < 15],
  [`RSS growth < 100 MB (got ${rssGrowth.toFixed(1)} MB)`, rssGrowth < 100],
  [`event listeners on the bus do not accumulate (got ${last.listeners})`, last.listeners < 50],
  [`cache is bounded (got ${last.cacheSize} entries)`, last.cacheSize <= 1000],
];
console.log('');
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
