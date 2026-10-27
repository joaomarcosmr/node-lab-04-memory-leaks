import { createWriteStream, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
const SIZE = Number(process.env.SIZE_MB ?? 256) * 1024 * 1024;
const dir = path.resolve('data'); mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'big.bin');
if (existsSync(file) && existsSync(path.join(dir, 'big.sha256'))) { console.log('data/big.bin already exists'); process.exit(0); }
const hash = createHash('sha256'); const out = createWriteStream(file); let written = 0;
function write() {
  while (written < SIZE) {
    const chunk = randomBytes(Math.min(1 << 20, SIZE - written)); hash.update(chunk); written += chunk.length;
    if (!out.write(chunk)) return out.once('drain', write);
  }
  out.end(() => { writeFileSync(path.join(dir, 'big.sha256'), hash.digest('hex')); console.log(`wrote data/big.bin (${SIZE / 1048576} MB)`); });
}
write();
