# Node Lab 04 — Memory leaks, heap snapshots and streams (NestJS + Prisma + Postgres)

> Interview question: **"How do you find and fix a memory leak in a Node.js service, and how do
> you serve large files without blowing up memory?"**

## The scenario

The catalog API (NestJS, Prisma, Postgres) gets OOM-killed every few hours in production. Memory
climbs steadily under normal traffic and nobody knows why. There is also a "download the product
import file" endpoint that spikes memory by hundreds of MB per request. You have the code and a
staging box — find the leaks with real tooling, fix them, and make the download stream.

## Setup

```bash
npm install
cp .env.example .env
npm run db:up          # Postgres on :5444
npm run db:setup       # migration + 50k products + data/big.bin (256 MB)
npm start              # builds and runs with --expose-gc (the checks force GCs through /debug/gc)
npm run check          # another terminal — fails today
```

Requires Node 20+ and Docker.

## Project structure

```
src/
  health/health.controller.ts            GET /health (memory stats), GET /debug/gc
  common/request-log*.ts                 middleware that logs every request… into an array
  products/
    products.service.ts                  search with a "cache"
    products.controller.ts               GET /products/search?q=, GET /products/:id (adds a listener)
    catalog.events.ts                    EventEmitter for product invalidation
  uploads/uploads.service.ts             POST /uploads keeps sessions "warm"
  files/files.controller.ts              GET /files/:name reads the whole file into memory
scripts/leak-check.mjs                   24k requests + forced GCs, measures growth
scripts/stream-check.mjs                 slow download, watches RSS and /health
```

There are **four** independent leaks and one streaming problem.

## Part 1 — Find the leaks with tools (before reading the code for answers)

Document in `NOTES.md`, for each leak: symptom → tool → root cause → fix. Use at least two of:

1. **Heap snapshot comparison**: `npm run start:inspect`, open `chrome://inspect`, snapshot, run
   `npm run check:leaks`, snapshot again, "Comparison" view sorted by size delta. Which constructors
   grow? Follow the retainers.
2. **`--heapsnapshot-signal=SIGUSR2`** on the process and `kill -USR2 <pid>` — the way you'd do it
   in a container without a debugger.
3. **Allocation sampling** in DevTools, or `node --heap-prof`.
4. **`npx clinic doctor -- node --expose-gc dist/main`**.

## Part 2 — Fix the leaks

- A cache needs a bound (LRU / max size / TTL). Implementing a tiny LRU with `Map` insertion order
  is a good exercise; `lru-cache` is fine too.
- Per-request listeners must be removed (`once`, `off`, `AbortSignal`) — or the design should not
  add listeners per request at all. Restore a sane `setMaxListeners` and make sure the warning
  never fires.
- Intervals must be cleared, `unref()`'d when they must not keep the process alive, and must not
  capture large buffers.
- "Debug" logs that grow forever go to a bounded ring buffer or to a real logger.

## Part 3 — Stream the download

Rewrite `FilesController.download` with `fs.createReadStream` + Nest's `StreamableFile` (or
`stream.pipeline`). Then answer in `NOTES.md`: what is backpressure, what happens when `res.write()`
returns `false` and you ignore it, why `pipeline` over `.pipe()`, what `highWaterMark` does.

### Acceptance criteria

- [ ] `npm run check:leaks` green: after 24k requests, heap + external growth < 20 MB, RSS growth < 100 MB,
      listener count stays low, cache stays bounded
- [ ] `npm run check:stream` green: sha256 matches, server peak RSS < baseline + 120 MB during a
      slow download, `/health` p99 < 50 ms during the download
- [ ] No `MaxListenersExceededWarning` in the server output during the checks
- [ ] `NOTES.md` documents the four leaks with real numbers from the tools, plus the streaming answers
- [ ] `readFileSync` is gone from `src/files/`

### Stretch goals

- `POST /uploads` streams to disk with a size limit (413 when exceeded) without buffering the body.
- `GET /files/:name?gzip=1` adds `zlib.createGzip()` to the pipeline.
- A test that reproduces one of the leaks with `--expose-gc` + `process.memoryUsage()`.

## What a senior answer sounds like

Leaks in Node are reachability problems: something long-lived (cache, emitter, timer, module-level
array, closure) holds per-request data. Diagnose with heap snapshot comparison (what grew, who
retains it), not by guessing. For large payloads never hold the whole thing: stream, respect
backpressure, use `pipeline` so errors and client disconnects clean up, and measure RSS and external
memory separately from the JS heap (Buffers live outside the V8 heap).
