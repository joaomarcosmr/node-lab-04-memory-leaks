import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Controller('files')
export class FilesController {
  private readonly dir = path.resolve('data');

  // ⚠️ Reads the whole file into memory (256 MB) for every download, blocking the loop while
  // reading and pinning +256 MB of RSS per concurrent download.
  @Get(':name')
  download(@Param('name') name: string, @Res() res: Response) {
    const file = path.join(this.dir, path.basename(name));
    if (!fs.existsSync(file)) throw new NotFoundException();
    const data = fs.readFileSync(file);
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('content-length', data.length);
    res.end(data);
  }
}
