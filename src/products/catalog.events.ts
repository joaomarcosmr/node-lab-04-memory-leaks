import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

// Emits 'invalidate' with a product id whenever a product changes (e.g. from an admin UI or a queue).
@Injectable()
export class CatalogEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0); // "fixes" the MaxListenersExceededWarning we kept seeing 🙃
  }
}
