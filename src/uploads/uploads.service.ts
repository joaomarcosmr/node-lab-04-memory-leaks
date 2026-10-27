import { Injectable } from '@nestjs/common';

interface Session {
  lastSeen: number;
  lastUpload: Buffer;
}

@Injectable()
export class UploadsService {
  private readonly sessions: Record<string, Session> = {};

  // ⚠️ Keeps the session "warm" with an interval that is never cleared — and the closure keeps
  // the whole upload body alive with it.
  receive(sessionId: string, body: Buffer) {
    const timer = setInterval(() => {
      this.sessions[sessionId] = { lastSeen: Date.now(), lastUpload: body };
    }, 1000);
    return { received: body.length, sessionId, timerActive: !!timer };
  }
}
