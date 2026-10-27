import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { ProductsModule } from './products/products.module';
import { UploadsModule } from './uploads/uploads.module';
import { FilesModule } from './files/files.module';
import { RequestLogMiddleware } from './common/request-log.middleware';
import { StatsController } from './common/stats.controller';
import { RequestLog } from './common/request-log';

@Module({
  imports: [PrismaModule, ProductsModule, UploadsModule, FilesModule],
  controllers: [HealthController, StatsController],
  providers: [RequestLog],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLogMiddleware).forRoutes('*');
  }
}
