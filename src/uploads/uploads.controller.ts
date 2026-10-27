import { Controller, Headers, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  async upload(@Req() req: Request, @Headers('x-session-id') sessionId = 'anonymous') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return this.uploads.receive(sessionId, Buffer.concat(chunks));
  }
}
