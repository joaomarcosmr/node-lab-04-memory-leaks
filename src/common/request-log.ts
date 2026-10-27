import { Injectable } from '@nestjs/common';

export interface LoggedRequest {
  at: number;
  method: string;
  url: string;
  headers: Record<string, unknown>;
}

// "Useful for debugging in staging" — and shipped to production.
@Injectable()
export class RequestLog {
  readonly entries: LoggedRequest[] = [];
}
