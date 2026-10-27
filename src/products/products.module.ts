import { Global, Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CatalogEvents } from './catalog.events';

@Global()
@Module({
  controllers: [ProductsController],
  providers: [ProductsService, CatalogEvents],
  exports: [ProductsService, CatalogEvents],
})
export class ProductsModule {}
