import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestLog } from './request-log';

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(private readonly log: RequestLog) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.log.entries.push({ at: Date.now(), method: req.method, url: req.originalUrl, headers: { ...req.headers } });
    next();
  }
}
