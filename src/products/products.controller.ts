import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CatalogEvents } from './catalog.events';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService, private readonly events: CatalogEvents) {}

  @Get('search')
  async search(@Query('q') q?: string) {
    if (!q || q.length < 2) throw new BadRequestException('q is required');
    const results = await this.products.search(q);
    return { q, count: results.length, first: results[0] ?? null };
  }

  @Get(':id')
  async get(@Param('id') idParam: string) {
    const id = Number(idParam);
    const product = await this.products.findOne(id);
    if (!product) throw new NotFoundException();

    // ⚠️ "If this product gets invalidated while the client still has it, we want to know."
    // A listener (and the closure holding `product`) is added on every request and never removed.
    const onInvalidate = (invalidatedId: number) => {
      if (invalidatedId === id) console.warn('served stale product', product.id, product.name);
    };
    this.events.on('invalidate', onInvalidate);
    return product;
  }
}
