import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettlementsService } from './settlements.service';

const uploadSchema = z.object({});

@Controller('driver/settlements')
@UseGuards(JwtAuthGuard)
export class DriverSettlementsController {
  constructor(private readonly svc: SettlementsService) {}

  @Get('me')
  async listMine(@CurrentUser() user: { id: string; role: string }) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers');
    return this.svc.listMine(user.id);
  }

  @Post(':id/proofs/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.STORAGE_LOCAL_DIR || './uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadProof(
    @CurrentUser() user: { id: string; role: string },
    @Param('id') settlementId: string,
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers');
    uploadSchema.parse(body);
    if (!file) throw new BadRequestException('file required');
    const url = `/uploads/${file.filename}`;
    return this.svc.uploadProof(user.id, settlementId, url);
  }
}
