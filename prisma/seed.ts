import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PRODUCTS = 50_000;
async function main() {
  const sample = await prisma.product.findFirst();
  if ((await prisma.product.count()) >= PRODUCTS && sample && sample.description.length > 2000) { console.log('products already seeded'); return; }
  await prisma.$executeRawUnsafe('TRUNCATE TABLE products RESTART IDENTITY'); // ids always start at 1
  const adjectives = ['wireless', 'ergonomic', 'vintage', 'compact', 'premium', 'rugged', 'smart', 'portable', 'classic', 'ultra'];
  const nouns = ['headphones', 'keyboard', 'backpack', 'lamp', 'speaker', 'monitor', 'charger', 'notebook', 'camera', 'bottle'];
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let start = 0; start < PRODUCTS; start += 10_000) {
    await prisma.product.createMany({ data: Array.from({ length: 10_000 }, () => ({
      name: `${adjectives[Math.floor(rnd() * 10)]} ${nouns[Math.floor(rnd() * 10)]} ${Math.floor(rnd() * 9000) + 1000}`,
      // Long descriptions (~2.4 KB): realistic for a catalog, and they make caching every result set expensive.
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(42),
    })) });
    process.stdout.write(`\rseeding products: ${start + 10_000}/${PRODUCTS}`);
  }
  console.log('\nseed done');
}
main().finally(() => prisma.$disconnect());
