import { Controller, Get } from '@nestjs/common';
import { RequestLog } from './request-log';

@Controller('stats')
export class StatsController {
  constructor(private readonly log: RequestLog) {}

  @Get()
  stats() {
    return { requestsSeen: this.log.entries.length };
  }
}
