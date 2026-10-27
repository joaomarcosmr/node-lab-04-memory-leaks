import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { CatalogEvents } from '../products/catalog.events';
import { ProductsService } from '../products/products.service';

@Controller()
export class HealthController {
  constructor(private readonly events: CatalogEvents, private readonly products: ProductsService) {}

  @Get('health')
  health() {
    const m = process.memoryUsage();
    return {
      ok: true,
      rssMb: +(m.rss / 1048576).toFixed(1),
      heapUsedMb: +(m.heapUsed / 1048576).toFixed(1),
      externalMb: +(m.external / 1048576).toFixed(1),
      listeners: this.events.listenerCount('invalidate'),
      cacheSize: this.products.cacheSize(),
    };
  }

  // Lets the leak check force a full GC between rounds. Needs `node --expose-gc`.
  @Get('debug/gc')
  gc() {
    if (typeof global.gc !== 'function') throw new InternalServerErrorException('start node with --expose-gc');
    global.gc();
    return { ok: true };
  }
}
