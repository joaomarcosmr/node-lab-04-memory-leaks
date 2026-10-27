// Downloads the 256 MB file through /download with a deliberately SLOW consumer while probing
// /health, and verifies the sha256, the server's memory ceiling and that /health stays responsive.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const expectedHash = readFileSync('server/data/big.sha256', 'utf8').trim();

const healthLat = [];
let peakRss = 0, peakExternal = 0, probing = true;
async function probe() {
  while (probing) {
    const t = performance.now();
    try {
      const b = await (await fetch(`${BASE}/health`)).json();
      healthLat.push(performance.now() - t);
      peakRss = Math.max(peakRss, b.rssMb); peakExternal = Math.max(peakExternal, b.externalMb ?? 0);
    } catch { healthLat.push(Infinity); }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const baseline = await (await fetch(`${BASE}/health`)).json();
console.log(`baseline rss ${baseline.rssMb} MB. Downloading with a slow consumer (this takes ~20s)...`);
const p = probe();
const t0 = Date.now();
const res = await fetch(`${BASE}/download`);
const hash = createHash('sha256');
let bytes = 0;
const reader = res.body.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  hash.update(value); bytes += value.length;
  if (bytes % (8 * 1024 * 1024) < value.length) await new Promise((r) => setTimeout(r, 400)); // slow client
}
probing = false; await p;
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const got = hash.digest('hex');
const sorted = healthLat.slice().sort((a, b) => a - b);
const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
console.log(`downloaded ${(bytes / 1048576).toFixed(0)} MB in ${secs}s; peak rss ${peakRss} MB; /health p99 ${p99 === Infinity ? 'timeout' : p99.toFixed(1) + 'ms'}`);

const checks = [
  ['sha256 of the download matches server/data/big.sha256', got === expectedHash],
  [`server peak RSS stayed below baseline + 120 MB (got +${(peakRss - baseline.rssMb).toFixed(0)} MB)`, peakRss - baseline.rssMb < 120],
  [`/health p99 < 50ms during the download`, p99 < 50],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
