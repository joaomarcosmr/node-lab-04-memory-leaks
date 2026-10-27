// ⚠️  This server leaks memory in several independent ways and handles large files badly.
// Find every leak with real tools (heap snapshots, --heapsnapshot-signal, clinic), fix them,
// then make /download stream. Do not change the HTTP contract.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const PORT = Number(process.env.PORT ?? 3000);
const BIG = path.resolve('server/data/big.bin');

const bus = new EventEmitter();
bus.setMaxListeners(0); // "fixes" the warning 🙃
const cache = new Map();
const requestLog = [];
const sessions = {};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function fakeSearch(q) {
  // pretend this hits a database and returns a big result set
  return Array.from({ length: 200 }, (_, i) => ({ id: i, q, title: `${q} result ${i}`, body: 'lorem '.repeat(20) }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const started = process.hrtime.bigint();

  requestLog.push({ at: Date.now(), method: req.method, url: req.url, headers: req.headers });

  if (url.pathname === '/health') {
    const m = process.memoryUsage();
    return json(res, 200, {
      ok: true,
      rssMb: +(m.rss / 1048576).toFixed(1),
      heapUsedMb: +(m.heapUsed / 1048576).toFixed(1),
      externalMb: +(m.external / 1048576).toFixed(1),
      listeners: bus.listenerCount('invalidate'),
      cacheSize: cache.size,
    });
  }

  if (url.pathname === '/debug/gc') {
    if (typeof global.gc !== 'function') return json(res, 500, { error: 'start with --expose-gc' });
    global.gc();
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/search') {
    const q = url.searchParams.get('q') ?? '';
    if (!cache.has(q)) cache.set(q, fakeSearch(q));
    const results = cache.get(q);
    return json(res, 200, { q, count: results.length, first: results[0] });
  }

  if (url.pathname === '/items' && url.searchParams.has('id')) {
    const id = url.searchParams.get('id');
    const onInvalidate = (invalidatedId) => {
      if (invalidatedId === id) cache.delete(`item:${id}`);
    };
    bus.on('invalidate', onInvalidate);
    return json(res, 200, { id, title: `item ${id}` });
  }

  if (url.pathname === '/upload' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const sessionId = req.headers['x-session-id'] ?? 'anonymous';
    const timer = setInterval(() => {
      sessions[sessionId] = { lastSeen: Date.now(), lastUpload: body };
    }, 1000);
    return json(res, 200, { received: body.length, sessionId, timerActive: !!timer });
  }

  if (url.pathname === '/download') {
    const data = fs.readFileSync(BIG);
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': data.length });
    res.end(data);
    return;
  }

  if (url.pathname === '/stats') {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return json(res, 200, { requestsSeen: requestLog.length, ms });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`listening on http://localhost:${PORT} (pid ${process.pid}, gc ${typeof global.gc === 'function' ? 'exposed' : 'hidden'})`));
