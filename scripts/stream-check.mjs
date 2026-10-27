// Downloads data/big.bin through /files/big.bin with a deliberately SLOW consumer while probing /health.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const expectedHash = readFileSync('data/big.sha256', 'utf8').trim();
const healthLat = []; let peakRss = 0, probing = true;
async function probe() {
  while (probing) {
    const t = performance.now();
    try { const b = await (await fetch(`${BASE}/health`)).json(); healthLat.push(performance.now() - t); peakRss = Math.max(peakRss, b.rssMb); } catch { healthLat.push(Infinity); }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const baseline = await (await fetch(`${BASE}/health`)).json();
console.log(`baseline rss ${baseline.rssMb} MB. Downloading with a slow consumer (~15s)...`);
const p = probe(); const t0 = Date.now();
const res = await fetch(`${BASE}/files/big.bin`);
const hash = createHash('sha256'); let bytes = 0; const reader = res.body.getReader();
while (true) {
  const { value, done } = await reader.read(); if (done) break;
  hash.update(value); bytes += value.length;
  if (bytes % (8 * 1024 * 1024) < value.length) await new Promise((r) => setTimeout(r, 400));
}
probing = false; await p;
const got = hash.digest('hex'); const sorted = healthLat.slice().sort((a, b) => a - b); const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
console.log(`downloaded ${(bytes / 1048576).toFixed(0)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s; peak rss ${peakRss} MB; /health p99 ${p99 === Infinity ? 'timeout' : p99.toFixed(1) + 'ms'}`);
const checks = [
  ['sha256 of the download matches data/big.sha256', got === expectedHash],
  [`server peak RSS stayed below baseline + 120 MB (got +${(peakRss - baseline.rssMb).toFixed(0)} MB)`, peakRss - baseline.rssMb < 120],
  ['/health p99 < 50ms during the download', p99 < 50],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
