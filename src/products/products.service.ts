import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Product } from '../generated/prisma/client';

@Injectable()
export class ProductsService {
  // ⚠️ "Cache": every distinct query (full rows, descriptions included) is kept forever.
  private readonly searchCache = new Map<string, Product[]>();

  constructor(private readonly prisma: PrismaService) {}

  async search(q: string): Promise<Product[]> {
    if (!this.searchCache.has(q)) {
      const rows = await this.prisma.product.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, take: 50, orderBy: { id: 'asc' } });
      this.searchCache.set(q, rows);
    }
    return this.searchCache.get(q)!;
  }

  findOne(id: number) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  cacheSize() {
    return this.searchCache.size;
  }
}
