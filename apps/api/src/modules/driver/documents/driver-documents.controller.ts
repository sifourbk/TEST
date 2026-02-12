import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/current-user.decorator';
import { DriverDocumentsService } from './driver-documents.service';
import { z } from 'zod';
import { diskStorage } from 'multer';
import { extname } from 'path';

const schema = z.object({
  type: z.enum(['DRIVER_LICENSE', 'ID_CARD', 'SELFIE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'BANK_PROOF']),
});

@Controller('driver/documents')
@UseGuards(JwtAuthGuard)
export class DriverDocumentsController {
  constructor(private readonly svc: DriverDocumentsService) {}

  @Get('me')
  list(@CurrentUser() user: { id: string; role: string }) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers');
    return this.svc.listMine(user.id);
  }

  @Post('upload')
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
  async upload(
    @CurrentUser() user: { id: string; role: string },
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers');
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!file) throw new BadRequestException('file required');
    const url = `/uploads/${file.filename}`;
    return this.svc.upload(user.id, parsed.data.type as any, url);
  }
}
