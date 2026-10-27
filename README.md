# Node Lab 04 — Memory leaks, heap snapshots and streams

> Interview question this lab trains: **"How do you find and fix a memory leak in a Node.js
> service, and how do you handle large payloads without blowing up memory?"**

`server/server.js` leaks memory in **four** independent ways and loads a 256 MB file into memory
to serve it. Your job is to find each leak with real tooling (not just by reading the code — the point
is to practice the tools), fix them, and make the download stream with backpressure.

## Setup

```bash
npm install
npm run seed        # creates server/data/big.bin (256 MB) + its sha256
npm start           # terminal 1 — runs with --expose-gc so the checks can force a GC
npm run check       # terminal 2 — watch it fail
```

Requires Node 20+.

## Part 1 — Find the leaks (write it down before fixing!)

Use at least two of these techniques and document what you saw in `NOTES.md` (screenshots or
pasted numbers welcome):

1. **Heap snapshot diff**: `npm run start:inspect`, open `chrome://inspect`, take a snapshot, run
   `npm run check:leaks`, take another, use "Comparison" view sorted by size delta. Which constructors
   grow? What are their retainers?
2. **`--heapsnapshot-signal=SIGUSR2`**: take snapshots from the terminal with `kill -USR2 <pid>`
   without a debugger attached (the way you'd do it in a container).
3. **Allocation sampling**: `node --heap-prof` or DevTools "Allocation sampling" to see *where* the
   allocations come from.
4. **`clinic doctor` / `clinic heapprofiler`** (`npx clinic doctor -- node server/server.js`).

For each of the four leaks write: symptom, tool that showed it, root cause, fix.
Hint on categories (not the answers): unbounded cache, listeners added per request, timers that are
never cleared holding closures, an ever-growing array "for debugging".

## Part 2 — Fix the leaks

Keep the behaviour and the HTTP contract. Guidance:

- A cache needs a **bound** (max entries, LRU, or TTL). Bonus for implementing a tiny LRU yourself
  with `Map` insertion order.
- Listeners added per request must be removed, or the design must not add listeners per request at
  all. `bus.setMaxListeners(0)` silences the warning Node gave you for free — put it back to a sane
  value and make sure it never fires.
- Timers that must exist should be cleared (`clearInterval`), `unref()`'d if they should not keep
  the process alive, and must not capture large buffers in their closure.
- "Debug" logs that grow forever go to a bounded ring buffer or to a real logger.

## Part 3 — Stream `/download`

`fs.readFileSync` of 256 MB means +256 MB RSS per concurrent download, and it blocks the loop while
reading. Rewrite it with `fs.createReadStream` + `stream.pipeline` (or `stream/promises`). Then
answer in `NOTES.md`:

- What is **backpressure**? What happens when `res.write()` returns `false` and you ignore it?
- Why `pipeline` instead of `.pipe()`? (error propagation, cleanup when the client disconnects)
- What is `highWaterMark` and what does changing it do here?

`npm run check:stream` downloads the file with a deliberately slow client while watching the
server's RSS and `/health` latency. With a correct stream implementation, server memory stays flat
no matter how slow the client is.

### Acceptance criteria

- [ ] `npm run check:leaks` green: after 24,000 requests, heap growth < 15 MB, RSS growth < 100 MB,
      listener count stays low, cache stays bounded
- [ ] `npm run check:stream` green: sha256 matches, server peak RSS < baseline + 120 MB during a
      slow download, `/health` p99 < 50 ms during the download
- [ ] No `MaxListenersExceededWarning` in the server output during the checks
- [ ] `NOTES.md` documents all four leaks (symptom → tool → cause → fix) with real numbers from
      the tools, plus the backpressure answers
- [ ] `fs.readFileSync` is gone from `/download`
- [ ] Server starts and passes both checks **without** `--expose-gc` too (the `/debug/gc` endpoint
      may return 500 in that case; the checks will tell you to add the flag — that is fine)

### Stretch goals

- Add `/upload` streaming to disk with a size limit (413 when exceeded) and `pipeline` to a
  `createWriteStream` without buffering the whole body.
- Add a `/download?gzip=1` variant using `zlib.createGzip()` in the pipeline.
- Reproduce a leak in a **test** using `--expose-gc` + `process.memoryUsage()` so it can never
  come back.

## What a senior answer sounds like

Leaks in Node are almost always *reachability* problems: something global (cache, emitter, timer,
module-level array, closure) keeps a reference to per-request data. Diagnose with heap snapshot
comparison (what grew? who retains it?), not by guessing. For large data, never hold the whole
payload: stream it, respect backpressure, use `pipeline` so errors and client disconnects clean up
properly, and measure RSS/external memory separately from the JS heap (Buffers live outside the
V8 heap).
