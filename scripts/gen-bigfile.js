// Creates server/data/big.bin (256 MB) and its sha256, used by the /download tests.
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

const SIZE = Number(process.env.SIZE_MB ?? 256) * 1024 * 1024;
const dir = path.resolve('server/data');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'big.bin');
const hash = createHash('sha256');
const out = createWriteStream(file);
let written = 0;
function write() {
  while (written < SIZE) {
    const chunk = randomBytes(Math.min(1 << 20, SIZE - written));
    hash.update(chunk);
    written += chunk.length;
    if (!out.write(chunk)) return out.once('drain', write); // backpressure, the right way
  }
  out.end(() => {
    writeFileSync(path.join(dir, 'big.sha256'), hash.digest('hex'));
    console.log(`wrote ${file} (${SIZE / 1048576} MB)`);
  });
}
write();
